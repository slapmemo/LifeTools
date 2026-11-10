import { getBackend, type DbBackend } from './backend';
import { createDbClient } from './client';
import { exportData, restoreData, validateBackup, type Backup } from '../core/backup';
import { runMigrations, type Executor } from './migrations';
import {
  NATIVE_HOST_NAME, NativeClient, createNativeExecutor, executorTransport,
  type NativeExecutor, type PortLike
} from './native';
import type { DbRequest, DbResponse, SqlParam } from './protocol';
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
      reasons: ['WORKERS' as chrome.offscreen.Reason, 'CLIPBOARD' as chrome.offscreen.Reason, 'BLOBS' as chrome.offscreen.Reason, 'USER_MEDIA' as chrome.offscreen.Reason],
      justification: 'SQLite veritabanını çalıştırmak, linkleri kopyalamak ve GIF hazırlamak için.'
    });
  })().finally(() => { inflight = null; });
  return inflight;
}

// ---------- Masaüstü (Native Messaging) arka ucu ----------

let nativeExec: NativeExecutor | null = null;
let nativeClient: NativeClient | null = null;
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
    nativeClient = client;
    nativeExec = createNativeExecutor(client);
  }
  return nativeExec;
}

/** DB arka ucundan bağımsız olarak aynı yerel bağlantıyı kullanır. */
export function nativeRequest(msg: Record<string, unknown>) {
  native();
  return nativeClient!.request(msg);
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
export function dbRequest(req: DbRequest, forced?: DbBackend): Promise<DbResponse> {
  return withLock(() => dbRequestUnlocked(req, forced));
}

// ---------- DB geneli muteks ----------

let lockTail: Promise<void> = Promise.resolve();

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lockTail;
  let release!: () => void;
  lockTail = new Promise<void>(resolve => { release = resolve; });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export const EXCLUSIVE_TIMEOUT_MS = 120_000;

/**
 * Çok adımlı işlemi DB kilidini tutarak çalıştırır; arka ucu bir kez sabitler.
 * Süre dolarsa açık işlem geri alınır, kilit bırakılır ve hata fırlatılır.
 */
export function withExclusiveDb<T>(
  fn: (ex: Executor) => Promise<T>,
  opts: { backend?: DbBackend; timeoutMs?: number } = {}
): Promise<T> {
  return withLock(async () => {
    const backend = opts.backend ?? await getBackend();
    const raw = createDbClient(req => dbRequestUnlocked(req, backend));
    let expired = false;
    const guard = <R>(run: () => Promise<R>): Promise<R> =>
      expired ? Promise.reject(new Error(EXCLUSIVE_TIMEOUT_MESSAGE)) : run();
    const ex: Executor = {
      exec: (sql, params) => guard(() => raw.exec(sql, params)),
      query: <R>(sql: string, params?: SqlParam[]) => guard(() => raw.query<R>(sql, params)),
      batch: (statements, batchOpts) => guard(() => raw.batch(statements, batchOpts))
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        raw.exec('ROLLBACK').catch(() => undefined).then(() => reject(new Error(EXCLUSIVE_TIMEOUT_MESSAGE)));
      }, opts.timeoutMs ?? EXCLUSIVE_TIMEOUT_MS);
    });
    const work = fn(ex);
    work.catch(() => undefined);
    try {
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
    }
  });
}

const EXCLUSIVE_TIMEOUT_MESSAGE = 'İşlem 120 saniyeyi aştı; geri alındı ve veritabanı kilidi bırakıldı';

/** Tek tutarlı okuma işleminde (BEGIN/COMMIT) dışa aktarır. */
export function exportBackground(settings: Record<string, unknown>, pageSize: number, backend?: DbBackend): Promise<Backup> {
  return withExclusiveDb(async ex => {
    await ex.exec('BEGIN');
    try {
      return await exportData(ex, settings, pageSize);
    } finally {
      try { await ex.exec('COMMIT'); } catch { /* işlem zaten bitmiş olabilir */ }
    }
  }, { backend });
}

/** Yedeği tek atomik işlemde, kilit altında geri yükler. */
export function restoreBackground(backup: Backup, backend?: DbBackend): Promise<Record<string, number>> {
  return withExclusiveDb(ex => restoreData(ex, backup), { backend });
}

async function dbRequestUnlocked(req: DbRequest, forced?: DbBackend): Promise<DbResponse> {
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
  // Yalnızca eklenti sayfaları (sender.tab.url chrome://extensions olabilir; içerik betikleri reddedilir).
  const fromExtensionPage = (sender: chrome.runtime.MessageSender): boolean =>
    sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
  const backendOf = (value: unknown): DbBackend | undefined => value === 'browser' || value === 'desktop' ? value : undefined;
  const fail = (err: unknown): DbResponse => ({ ok: false, error: err instanceof Error ? err.message : String(err) });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;
    if (msg.channel === BG_CHANNEL) {
      if (!fromExtensionPage(sender)) {
        sendResponse({ ok: false, error: 'Veritabanı köprüsüne erişim reddedildi' });
        return false;
      }
      void dbRequest(msg.req as DbRequest, backendOf(msg.backend)).then(sendResponse);
      return true;
    }
    if (msg.type === 'backup:restore' || msg.type === 'backup:export') {
      if (!fromExtensionPage(sender)) {
        sendResponse({ ok: false, error: 'Veritabanı köprüsüne erişim reddedildi' });
        return false;
      }
      const backend = backendOf(msg.backend);
      const task: Promise<unknown> = msg.type === 'backup:restore'
        ? Promise.resolve().then(() => restoreBackground(validateBackup(msg.backup), backend))
        : exportBackground(
          typeof msg.settings === 'object' && msg.settings !== null ? msg.settings as Record<string, unknown> : {},
          Number.isInteger(msg.pageSize) && msg.pageSize > 0 ? msg.pageSize : 100,
          backend
        );
      void task.then(data => sendResponse({ ok: true, data }), err => sendResponse(fail(err)));
      return true;
    }
    return false;
  });
}

/** Aynı offscreen belge üzerinden panoya metin kopyalar. */
export async function copyOffscreen(text: string): Promise<boolean> {
  await ensureOffscreen();
  return (await chrome.runtime.sendMessage({ channel: 'lifetools:clipboard', text })) === true;
}
