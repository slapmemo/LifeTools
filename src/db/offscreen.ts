import type { DbRequest, DbResponse } from './protocol';
import { OFFSCREEN_CHANNEL } from './protocol';

// Offscreen belge yalnızca Worker'ı barındırır ve mesajları ona aktarır.
const worker = new Worker(new URL('db-worker.js', location.href), { type: 'module' });
const pending = new Map<number, (res: DbResponse) => void>();
let nextId = 1;

worker.onmessage = (event: MessageEvent<{ id: number; res: DbResponse }>) => {
  const { id, res } = event.data;
  pending.get(id)?.(res);
  pending.delete(id);
};

worker.onerror = event => {
  const res: DbResponse = { ok: false, error: event.message || 'DB Worker hatası' };
  for (const respond of pending.values()) respond(res);
  pending.clear();
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.channel !== OFFSCREEN_CHANNEL) return false;
  const id = nextId++;
  pending.set(id, sendResponse);
  worker.postMessage({ id, req: msg.req as DbRequest });
  return true;
});
