import { isModuleEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { describeTabs } from './browser';
import { AUTO_PREFIX, createSessionsRepo, oldAutoSessionIds } from './repo';
import { AUTO_GROUP_KEY, AUTO_SAVE_KEY } from './settings';
import { decideAutoGroup, type SessionTabInput } from './tabs';
import { extensionBaseUrl, isInternalTabUrl } from '../../core/internal-tab';

export const LIFE_BROWSER_ID = 'life-browser';
const snapshotKey = (id: number): string => `lifeBrowserWindow:${id}`;
const ungroupKey = (id: number): string => `lifeBrowserUngrouped:${id}`;
const closedKey = (id: number): string => `lifeBrowserClosed:${id}`;
const repo = createSessionsRepo(backgroundDb);
const snapshotTimers = new Map<number, ReturnType<typeof setTimeout>>();
const groupTimers = new Map<number, ReturnType<typeof setTimeout>>();
let saveQueue = Promise.resolve();
let groupQueue = Promise.resolve();
const closingWindows = new Set<number>();

async function enabled(key: string): Promise<boolean> {
  return await isModuleEnabled(LIFE_BROWSER_ID) && (await chrome.storage.local.get({ [key]: false }))[key] === true;
}
async function snapshot(windowId: number): Promise<void> {
  if (closingWindows.has(windowId) || !await enabled(AUTO_SAVE_KEY)) return;
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== 'normal' || win.incognito) return;
    const tabs = await describeTabs(await chrome.tabs.query({ windowId }));
    if (closingWindows.has(windowId)) return;
    await chrome.storage.session.set({ [snapshotKey(windowId)]: tabs });
  } catch { /* Pencere kapanmış olabilir. */ }
}
function scheduleSnapshot(windowId: number): void {
  clearTimeout(snapshotTimers.get(windowId));
  snapshotTimers.set(windowId, setTimeout(() => { snapshotTimers.delete(windowId); void snapshot(windowId); }, 500));
}
async function groupTab(tabId: number): Promise<void> {
  if (!await enabled(AUTO_GROUP_KEY)) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    const win = await chrome.windows.get(tab.windowId);
    if (win.type !== 'normal' || win.incognito || tab.incognito) return;
    const tabs = await chrome.tabs.query({ windowId: tab.windowId });
    const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
    const keys = tabs.flatMap(t => t.id === undefined ? [] : [ungroupKey(t.id)]);
    const stored = await chrome.storage.session.get(keys);
    const recent = new Set(tabs.flatMap(t => t.id !== undefined && typeof stored[ungroupKey(t.id)] === 'number' && Date.now() - stored[ungroupKey(t.id)] < 600000 ? [t.id] : []));
    const decision = decideAutoGroup(tab, tabs, new Map(groups.map(g => [g.id, { title: g.title ?? '', color: g.color }])), recent);
    if (decision.action === 'join') await chrome.tabs.group({ tabIds: tabId, groupId: decision.groupId });
    if (decision.action === 'create') {
      const id = await chrome.tabs.group({ tabIds: decision.tabIds, createProperties: { windowId: tab.windowId } });
      await chrome.tabGroups.update(id, { title: decision.title, color: decision.color });
    }
  } catch { /* Sekme veya grup bu arada kapanmış olabilir. */ }
}
function scheduleGroup(id: number): void {
  clearTimeout(groupTimers.get(id));
  groupTimers.set(id, setTimeout(() => { groupTimers.delete(id); groupQueue = groupQueue.then(() => groupTab(id)).catch(error => { console.error(error); }); }, 500));
}
async function saveClosed(windowId: number): Promise<void> {
  if (!await enabled(AUTO_SAVE_KEY)) return;
  const key = snapshotKey(windowId), marker = closedKey(windowId);
  const stored = await chrome.storage.session.get([key, marker]);
  const raw = stored[key];
  const tabs: SessionTabInput[] = Array.isArray(raw) ? (raw as SessionTabInput[]).filter(tab => !isInternalTabUrl(tab.url, extensionBaseUrl())) : [];
  if (stored[marker] || !Array.isArray(tabs) || tabs.length < 2) return;
  await chrome.storage.session.set({ [marker]: true });
  try {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    await repo.save(`${AUTO_PREFIX}${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`, tabs);
    for (const id of oldAutoSessionIds(await repo.list())) await repo.delete(id);
    await chrome.storage.session.remove(key);
  } catch (error) { await chrome.storage.session.remove(marker); console.error('Otomatik oturum kaydedilemedi', error); }
}
export function initLifeBrowserBackground(): void {
  chrome.tabs.onCreated.addListener(tab => { scheduleSnapshot(tab.windowId); });
  chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.groupId === -1) void chrome.storage.session.set({ [ungroupKey(id)]: Date.now() });
    if (change.url !== undefined || change.status === 'complete') scheduleGroup(id);
    scheduleSnapshot(tab.windowId);
  });
  chrome.tabs.onRemoved.addListener((id, info) => { clearTimeout(groupTimers.get(id)); groupTimers.delete(id); void chrome.storage.session.remove(ungroupKey(id)); if (info.isWindowClosing) closingWindows.add(info.windowId); else scheduleSnapshot(info.windowId); });
  chrome.tabs.onMoved.addListener((_id, info) => scheduleSnapshot(info.windowId));
  chrome.tabs.onAttached.addListener((_id, info) => scheduleSnapshot(info.newWindowId));
  chrome.tabs.onDetached.addListener((_id, info) => scheduleSnapshot(info.oldWindowId));
  chrome.tabGroups.onCreated.addListener(group => scheduleSnapshot(group.windowId));
  chrome.tabGroups.onUpdated.addListener(group => scheduleSnapshot(group.windowId));
  chrome.tabGroups.onRemoved.addListener(group => scheduleSnapshot(group.windowId));
  chrome.tabGroups.onMoved.addListener(group => scheduleSnapshot(group.windowId));
  chrome.windows.onRemoved.addListener(id => {
    closingWindows.add(id);
    clearTimeout(snapshotTimers.get(id)); snapshotTimers.delete(id);
    saveQueue = saveQueue.then(() => saveClosed(id)).catch(error => { console.error(error); });
  });
  const seed = (): void => { void chrome.windows.getAll({ windowTypes: ['normal'] }).then(windows => { for (const win of windows) if (win.id !== undefined && !win.incognito) scheduleSnapshot(win.id); }); };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[AUTO_SAVE_KEY]?.newValue === true) seed(); });
  seed();
}
