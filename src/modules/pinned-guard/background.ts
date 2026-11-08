import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { CLOSED_KEY, NOTIFICATION_PREFIX, PINNED_MAP_KEY, pushClosed, type PinnedInfo } from './guard';
import { loadClosed, reopenPinned } from './restore';
import { extensionBaseUrl, isInternalTabUrl } from '../../core/internal-tab';
export const PINNED_GUARD_ID = 'pinned-guard';
type PinnedMap = Record<string, PinnedInfo>;
let queue = Promise.resolve();
function schedule(action: () => Promise<void>): void { queue = queue.then(action).catch(e => console.debug('[Sabit Sekme Koruyucu]', e)); }
async function loadMap(): Promise<PinnedMap> { return { ...((await chrome.storage.session.get({ [PINNED_MAP_KEY]: {} }))[PINNED_MAP_KEY] as PinnedMap) }; }
async function saveMap(map: PinnedMap): Promise<void> { await chrome.storage.session.set({ [PINNED_MAP_KEY]: map }); }
const info = (tab: chrome.tabs.Tab, previous?: PinnedInfo): PinnedInfo => {
  const url = tab.url || tab.pendingUrl || previous?.url || '';
  return { url, title: tab.title || previous?.title || url, windowId: tab.windowId };
};
async function seed(): Promise<void> {
  if (!(await isModuleEnabled(PINNED_GUARD_ID))) { await saveMap({}); return; }
  const map: PinnedMap = {};
  for (const tab of await chrome.tabs.query({ pinned: true })) if (tab.id !== undefined) map[String(tab.id)] = info(tab);
  await saveMap(map);
}
async function removed(tabId: number, isWindowClosing: boolean): Promise<void> {
  const map = await loadMap();
  const entry = map[String(tabId)];
  if (!entry) return;
  delete map[String(tabId)];
  await saveMap(map);
  if (isWindowClosing || !entry.url || isInternalTabUrl(entry.url, extensionBaseUrl()) || !(await isModuleEnabled(PINNED_GUARD_ID))) return;
  const closedAt = Date.now();
  const key = `${tabId}-${closedAt}`;
  await chrome.storage.local.set({ [CLOSED_KEY]: pushClosed(await loadClosed(), { ...entry, key, closedAt }) });
  chrome.notifications.create(NOTIFICATION_PREFIX + key, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Sabit sekme kapandı',
    message: entry.title || entry.url,
    buttons: [{ title: 'Geri aç' }],
    priority: 1
  }, () => { void chrome.runtime.lastError; });
}
export function initPinnedGuardBackground(): void {
  chrome.tabs.onCreated.addListener(tab => schedule(async () => {
    if (!tab.pinned || tab.id === undefined || !(await isModuleEnabled(PINNED_GUARD_ID))) return;
    const map = await loadMap(); map[String(tab.id)] = info(tab); await saveMap(map);
  }));
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.pinned === undefined && !(tab.pinned && (change.url !== undefined || change.title !== undefined))) return;
    schedule(async () => {
      if (!(await isModuleEnabled(PINNED_GUARD_ID))) return;
      const map = await loadMap();
      if (tab.pinned) map[String(tabId)] = info(tab, map[String(tabId)]);
      else delete map[String(tabId)];
      await saveMap(map);
    });
  });
  chrome.tabs.onAttached.addListener((tabId, attach) => schedule(async () => {
    const map = await loadMap(); const entry = map[String(tabId)];
    if (!entry) return;
    map[String(tabId)] = { ...entry, windowId: attach.newWindowId }; await saveMap(map);
  }));
  chrome.tabs.onReplaced.addListener((added, removedId) => schedule(async () => {
    const map = await loadMap(); const entry = map[String(removedId)];
    if (!entry) return;
    delete map[String(removedId)]; map[String(added)] = entry; await saveMap(map);
  }));
  chrome.tabs.onRemoved.addListener((tabId, removeInfo) => schedule(() => removed(tabId, removeInfo.isWindowClosing)));
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (!notificationId.startsWith(NOTIFICATION_PREFIX) || buttonIndex !== 0) return;
    const key = notificationId.slice(NOTIFICATION_PREFIX.length);
    schedule(async () => {
      chrome.notifications.clear(notificationId, () => { void chrome.runtime.lastError; });
      const entry = (await loadClosed()).find(item => item.key === key);
      if (entry) await reopenPinned(entry);
    });
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[MODULE_FLAGS_KEY]) schedule(seed); });
  chrome.runtime.onStartup.addListener(() => schedule(seed));
  chrome.runtime.onInstalled.addListener(() => schedule(seed));
}
