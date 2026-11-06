import { getBackend, type DbBackend } from './backend';
import { createDbClient } from './client';
import { runMigrations } from './migrations';
import {
  NATIVE_HOST_NAME, NativeClient, createNativeExecutor, executorTransport,
  type NativeExecutor, type PortLike
} from './native';
import type { DbRequest, DbResponse } from './protocol';
import { BG_CHANNEL, OFFSCREEN_CHANNEL } from './protocol';

let inflight: Promise<void> | null = null;

/** Offscreen belgeyi gerekirse (ve yalnızca bir kez) oluşturur. */
export function ensureOffscreen(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const existing = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType]
    });
    if (existing.length > 0) return;
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS' as chrome.offscreen.Reason, 'CLIPBOARD' as chrome.offscreen.Reason],
      justification: 'SQLite veritabanını çalıştırmak ve temiz linkleri panoya kopyalamak için.'
    });
  })().finally(() => { inflight = null; });
  return inflight;
}

// ---------- Masaüstü (Native Messaging) arka ucu ----------

let nativeExec: NativeExecutor | null = null;
let desktopReady: Promise<void> | null = null;

function native(): NativeExecutor {
  if (!nativeExec) {
    const client = new NativeClient({
      connect: () => chrome.runtime.connectNative(NATIVE_HOST_NAME) as unknown as PortLike,
      onDisconnect: () => {
        void chrome.runtime.lastError; // "Unchecked lastError" uyarısını önler
        desktopReady = null; // yeniden bağlanınca migrasyonlar bir kez daha doğrulanır
      }
    });
    nativeExec = createNativeExecutor(client);
  }
  return nativeExec;
}

/** Eklenti migrasyonları, aktif arka ucun (masaüstü) DB'sinde de çalışır. */
function ensureDesktopReady(ex: NativeExecutor): Promise<void> {
  if (!desktopReady) {
    const attempt = runMigrations(ex).then(() => undefined);
    desktopReady = attempt;
    attempt.catch(() => { if (desktopReady === attempt) desktopReady = null; });
  }
  return desktopReady;
}

async function desktopRequest(req: DbRequest): Promise<DbResponse> {
  const ex = native();
  try {
    await ensureDesktopReady(ex);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return executorTransport(ex)(req);
}

/**
 * Service worker içinden: isteği ayardaki (veya `forced`) arka uca iletir.
 * Masaüstü seçiliyken ulaşılamazsa tarayıcı DB'sine SESSİZCE düşülmez; hata döner.
 */
export async function dbRequest(req: DbRequest, forced?: DbBackend): Promise<DbResponse> {
  try {
    if (req.op === 'ping') return { ok: true, data: await native().ping() };
    if ((forced ?? await getBackend()) === 'desktop') return await desktopRequest(req);
    await ensureOffscreen();
    const res = (await chrome.runtime.sendMessage({ channel: OFFSCREEN_CHANNEL, req })) as DbResponse | undefined;
    return res ?? { ok: false, error: 'Offscreen belge yanıt vermedi' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Service worker içinde kullanılacak DB API'si. */
export const backgroundDb = createDbClient(dbRequest);

/** Popup vb. sayfalardan gelen DB isteklerini karşılar. */
export function registerDbBridge(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.channel !== BG_CHANNEL) return false;
    const forced: DbBackend | undefined = msg.backend === 'browser' || msg.backend === 'desktop' ? msg.backend : undefined;
    void dbRequest(msg.req as DbRequest, forced).then(sendResponse);
    return true;
  });
}

/** Aynı offscreen belge üzerinden panoya metin kopyalar. */
export async function copyOffscreen(text: string): Promise<boolean> {
  await ensureOffscreen();
  return (await chrome.runtime.sendMessage({ channel: 'lifetools:clipboard', text })) === true;
}
