import { ensureOffscreen } from '../../db/host';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { clampPercent } from './logic';
const channel = 'lifetools:volume-audio';
const origins = new Map<number, string>();
let queue: Promise<void> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> { const result = queue.then(fn); queue = result.then(() => {}, () => {}); return result; }
async function audio(action: string, tabId: number, extra: object = {}): Promise<any> {
  await ensureOffscreen(); return chrome.runtime.sendMessage({ channel, action, tabId, ...extra });
}
async function reset(tabId: number): Promise<void> {
  origins.delete(tabId);
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
  if (contexts.length) await audio('reset', tabId);
}
export function initVolumeBackground(): void {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.channel !== 'lifetools:volume' || sender.id !== chrome.runtime.id || sender.tab || !Number.isInteger(msg.tabId)) return false;
    void enqueue(async () => {
      if (!await isModuleEnabled('volume-booster')) return { ok: false };
      const tabId = msg.tabId as number;
      if (msg.action === 'get') return audio('get', tabId);
      if (msg.action === 'reset') { await reset(tabId); return { ok: true, percent: 100 }; }
      if (msg.action !== 'set' || typeof msg.percent !== 'number') return { ok: false };
      const percent = clampPercent(msg.percent);
      const current = await audio('get', tabId);
      if (!current?.captured && percent === 100) return { ok: true, percent: 100 };
      if (current?.captured) return audio('set', tabId, { percent });
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url || !/^https?:/i.test(tab.url)) throw new Error('unsupported');
      const origin = new URL(tab.url).origin;
      const streamId = await new Promise<string>((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, id => { const error = chrome.runtime.lastError; if (error || !id) reject(new Error(error?.message || 'Capture failed')); else resolve(id); }));
      const result = await audio('set', tabId, { percent, streamId, origin });
      if (result?.ok) { const latest = await chrome.tabs.get(tabId); if (!latest.url || new URL(latest.url).origin !== origin) { await reset(tabId); return { ok: false }; } origins.set(tabId, origin); }
      return result;
    }).then(respond, () => respond({ ok: false })); return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => { void enqueue(() => reset(tabId)).catch(() => {}); });
  chrome.tabs.onUpdated.addListener((tabId, change) => { if (!change.url) return; void enqueue(async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType] });
    if (!contexts.length) return;
    const state = await audio('get', tabId);
    if (state?.captured && state.origin !== new URL(change.url!).origin) await reset(tabId);
  }).catch(() => {}); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[MODULE_FLAGS_KEY]) void (async () => {
    if (await isModuleEnabled('volume-booster')) return;
    for (const tab of await chrome.tabs.query({})) if (tab.id !== undefined) await enqueue(() => reset(tab.id!));
  })().catch(() => {}); });
}
