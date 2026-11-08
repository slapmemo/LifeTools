import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PIN_MANAGER_KEY } from './settings';
import { initWorkspaceEngine } from './workspace-engine';

export const TAB_MANAGER_ID = 'tab-manager';
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let queue = Promise.resolve();

async function reconcile(windowId: number): Promise<void> {
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== 'normal' || win.incognito) return;
    const url = chrome.runtime.getURL('tabs.html');
    const tabs = (await chrome.tabs.query({ windowId })).filter(t => (t.url || t.pendingUrl) === url).sort((a, b) => a.index - b.index);
    const enabled = await isModuleEnabled(TAB_MANAGER_ID) && (await chrome.storage.local.get({ [PIN_MANAGER_KEY]: true }))[PIN_MANAGER_KEY] === true;
    if (!enabled) {
      const ids = tabs.flatMap(t => t.id === undefined ? [] : [t.id]);
      if (ids.length) await chrome.tabs.remove(ids);
      return;
    }
    const [first, ...duplicates] = tabs;
    const ids = duplicates.flatMap(t => t.id === undefined ? [] : [t.id]);
    if (ids.length) await chrome.tabs.remove(ids);
    if (!first) await chrome.tabs.create({ windowId, url, pinned: true, index: 0, active: false });
    else if (first.id !== undefined) {
      if (!first.pinned) await chrome.tabs.update(first.id, { pinned: true });
      if (first.index !== 0) await chrome.tabs.move(first.id, { index: 0 });
    }
  } catch { /* Window may have closed. */ }
}
function schedule(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); queue = queue.then(() => reconcile(id)).catch(console.error); }, 1000));
}
function scheduleAll(): void {
  void chrome.windows.getAll({ windowTypes: ['normal'] }).then(wins => wins.forEach(w => { if (w.id !== undefined && !w.incognito) schedule(w.id); }));
}
export function initTabManagerBackground(): void {
  initWorkspaceEngine();
  chrome.runtime.onStartup.addListener(scheduleAll);
  chrome.runtime.onInstalled.addListener(scheduleAll);
  chrome.windows.onCreated.addListener(win => { if (win.id !== undefined && win.type === 'normal' && !win.incognito) schedule(win.id); });
  chrome.windows.onRemoved.addListener(id => { clearTimeout(timers.get(id)); timers.delete(id); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PIN_MANAGER_KEY] || changes[MODULE_FLAGS_KEY])) scheduleAll(); });
}
