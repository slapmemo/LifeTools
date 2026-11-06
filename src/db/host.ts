import { createDbClient } from './client';
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
      reasons: ['WORKERS' as chrome.offscreen.Reason],
      justification: 'SQLite (wasm) veritabanını OPFS üzerinde bir Worker içinde çalıştırmak için.'
    });
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Service worker içinden: isteği offscreen belgeye iletir. */
export async function dbRequest(req: DbRequest): Promise<DbResponse> {
  try {
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
    void dbRequest(msg.req as DbRequest).then(sendResponse);
    return true;
  });
}
