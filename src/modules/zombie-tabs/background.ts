import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { moveTabsToSession } from '../life-browser/browser';
import { createSessionsRepo } from '../life-browser/repo';
import { AUTO_SLEEP_KEY, WEEKLY_KEY, LAST_SLEEP_KEY, LAST_WEEKLY_KEY, LAST_ACTIVE_KEY, ZOMBIE_HOURS_KEY, normalizeHours, pickTabsToDiscard, selectZombies, weeklyDue } from './zombie';
export const ZOMBIE_TABS_ID = 'zombie-tabs';
const SLEEP_ALARM = 'zombie-sleep', WEEKLY_ALARM = 'zombie-weekly', NOTICE = 'zombie-weekly-notice';
const NOTICE_KEY = 'zombieWeeklyNotice';
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
async function syncAlarms(): Promise<void> {
  const settings = await chrome.storage.local.get({ [AUTO_SLEEP_KEY]: false, [WEEKLY_KEY]: true });
  const enabled = await isModuleEnabled(ZOMBIE_TABS_ID);
  for (const [name, on, period] of [[SLEEP_ALARM, settings[AUTO_SLEEP_KEY], 60], [WEEKLY_ALARM, settings[WEEKLY_KEY], 7 * 24 * 60]] as const) {
    if (enabled && on === true) {
      if (!(await chrome.alarms.get(name))) await chrome.alarms.create(name, { periodInMinutes: period });
    } else await chrome.alarms.clear(name);
  }
}
async function candidates(hours: number): Promise<chrome.tabs.Tab[]> {
  const [tabs, data] = await Promise.all([chrome.tabs.query({ windowType: 'normal' }), chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {} })]);
  return selectZombies(tabs, data[LAST_ACTIVE_KEY] as NumMap, Date.now(), hours).map(z => z.tab);
}
async function sleepTabs(): Promise<void> {
  const settings = await chrome.storage.local.get({ [AUTO_SLEEP_KEY]: false, [ZOMBIE_HOURS_KEY]: null });
  if (settings[AUTO_SLEEP_KEY] !== true || !(await isModuleEnabled(ZOMBIE_TABS_ID))) return;
  const [tabs, data] = await Promise.all([chrome.tabs.query({ windowType: 'normal' }), chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {} })]);
  const last = data[LAST_ACTIVE_KEY] as NumMap;
  const selected = pickTabsToDiscard(tabs.map(tab => ({ ...tab, lastAccessed: last[String(tab.id)] ?? tab.lastAccessed })), Date.now(), normalizeHours(settings[ZOMBIE_HOURS_KEY]));
  let count = 0;
  for (const tab of selected) {
    try {
      const current = await chrome.tabs.get(tab.id!);
      const fresh = await chrome.storage.session.get({ [LAST_ACTIVE_KEY]: {} });
      const tracked = fresh[LAST_ACTIVE_KEY] as NumMap;
      if (pickTabsToDiscard([{ ...current, lastAccessed: tracked[String(tab.id)] ?? current.lastAccessed }], Date.now(), normalizeHours(settings[ZOMBIE_HOURS_KEY])).length) { await chrome.tabs.discard(tab.id!); count++; }
    } catch { /* Sekme kapanmış veya artık uyutulamıyor olabilir. */ }
  }
  await chrome.storage.local.set({ [LAST_SLEEP_KEY]: { count, time: Date.now() } });
}
async function weeklyNotice(): Promise<void> {
  const settings = await chrome.storage.local.get({ [WEEKLY_KEY]: true, [LAST_WEEKLY_KEY]: null });
  if (settings[WEEKLY_KEY] === false || !(await isModuleEnabled(ZOMBIE_TABS_ID)) || !weeklyDue(settings[LAST_WEEKLY_KEY], Date.now())) return;
  const tabs = await candidates(72);
  if (tabs.length < 5) return;
  const move = await isModuleEnabled('life-browser');
  await chrome.storage.local.set({ [NOTICE_KEY]: { ids: tabs.map(tab => tab.id), move } });
  await chrome.notifications.create(NOTICE, { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Zombi sekmeler', message: `${tabs.length} sekme 3+ gündür açılmadı`, buttons: move ? [{ title: 'Oturuma taşı' }, { title: 'Göster' }] : [{ title: 'Göster' }] });
  await chrome.storage.local.set({ [LAST_WEEKLY_KEY]: Date.now() });
}
async function noticeClick(index: number): Promise<void> {
  if (!(await isModuleEnabled(ZOMBIE_TABS_ID))) return;
  const data = await chrome.storage.local.get({ [NOTICE_KEY]: null });
  const notice = data[NOTICE_KEY] as { ids?: number[]; move?: boolean } | null;
  if (!notice || !Array.isArray(notice.ids)) return;
  if (notice.move && index === 0) {
    if (!(await isModuleEnabled('life-browser'))) return;
    const ids = new Set(notice.ids);
    const tabs = (await candidates(72)).filter(tab => tab.id !== undefined && ids.has(tab.id));
    if (tabs.length) {
      const date = new Date();
      const name = `Zombiler — ${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
      await moveTabsToSession(createSessionsRepo(backgroundDb), name, tabs);
    }
  } else if ((notice.move && index === 1) || (!notice.move && index === 0)) {
    if (await isModuleEnabled('tab-switcher')) await chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html?zombies=1') });
  } else return;
  await chrome.notifications.clear(NOTICE);
  await chrome.storage.local.remove(NOTICE_KEY);
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
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[AUTO_SLEEP_KEY] || changes[WEEKLY_KEY])) schedule(async () => { await seed(); await syncAlarms(); }); });
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === SLEEP_ALARM) schedule(sleepTabs); else if (alarm.name === WEEKLY_ALARM) schedule(weeklyNotice); });
  chrome.notifications.onButtonClicked.addListener((id, index) => { if (id === NOTICE) schedule(() => noticeClick(index)); });
  chrome.runtime.onStartup.addListener(() => schedule(async () => { await seed(); await syncAlarms(); }));
  chrome.runtime.onInstalled.addListener(() => schedule(async () => { await seed(); await syncAlarms(); }));
  schedule(syncAlarms);
}
