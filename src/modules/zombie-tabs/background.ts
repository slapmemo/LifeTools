import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { LAST_ACTIVE_KEY } from './zombie';
export const ZOMBIE_TABS_ID = 'zombie-tabs';
/** Pencere kimliği -> o penceredeki etkin sekme (bir önceki etkin sekmenin ayrılış zamanını yazmak için). */
const ACTIVE_BY_WINDOW_KEY = 'zombieTabsActiveByWindow';
type NumMap = Record<string, number>;
let queue = Promise.resolve();
function schedule(action: () => Promise<void>): void { queue = queue.then(action).catch(e => console.debug('[Zombi Sekmeler]', e)); }
async function load(): Promise<{ last: NumMap; active: NumMap }> {
  const data = await chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {}, [ACTIVE_BY_WINDOW_KEY]: {} });
  return { last: { ...(data[LAST_ACTIVE_KEY] as NumMap) }, active: { ...(data[ACTIVE_BY_WINDOW_KEY] as NumMap) } };
}
async function save(last: NumMap, active: NumMap): Promise<void> { await chrome.storage.session.set({ [LAST_ACTIVE_KEY]: last, [ACTIVE_BY_WINDOW_KEY]: active }); }
async function activated(tabId: number, windowId: number): Promise<void> {
  if (!(await isModuleEnabled(ZOMBIE_TABS_ID))) return;
  const { last, active } = await load(); const now = Date.now();
  const previous = active[String(windowId)];
  if (previous !== undefined && previous !== tabId) last[String(previous)] = now;
  last[String(tabId)] = now; active[String(windowId)] = tabId;
  await save(last, active);
}
async function seed(): Promise<void> {
  if (!(await isModuleEnabled(ZOMBIE_TABS_ID))) return;
  const { last, active } = await load(); const now = Date.now();
  for (const tab of await chrome.tabs.query({ active: true })) {
    if (tab.id === undefined) continue;
    last[String(tab.id)] = now; active[String(tab.windowId)] = tab.id;
  }
  await save(last, active);
}
export function initZombieTabsBackground(): void {
  chrome.tabs.onActivated.addListener(info => schedule(() => activated(info.tabId, info.windowId)));
  chrome.tabs.onRemoved.addListener(tabId => schedule(async () => {
    const { last, active } = await load();
    if (!(String(tabId) in last)) return;
    delete last[String(tabId)];
    await save(last, active);
  }));
  chrome.windows.onRemoved.addListener(windowId => schedule(async () => {
    const { last, active } = await load();
    if (!(String(windowId) in active)) return;
    delete active[String(windowId)];
    await save(last, active);
  }));
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[MODULE_FLAGS_KEY]) schedule(seed); });
  chrome.runtime.onStartup.addListener(() => schedule(seed));
  chrome.runtime.onInstalled.addListener(() => schedule(seed));
}
