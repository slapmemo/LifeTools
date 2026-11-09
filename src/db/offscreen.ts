import type { DbRequest, DbResponse } from './protocol';
import { OFFSCREEN_CHANNEL } from './protocol';
import '../modules/x-video/gif-offscreen';
import '../modules/volume-booster/offscreen-audio';

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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.channel !== 'lifetools:clipboard' || typeof msg.text !== 'string') return false;
  const textarea = document.createElement('textarea');
  textarea.value = msg.text;
  document.body.append(textarea);
  textarea.select();
  try { sendResponse(document.execCommand('copy')); }
  catch { sendResponse(false); }
  finally { textarea.remove(); }
  return false;
});
