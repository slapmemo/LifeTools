import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTimeTrackerRepo } from './repo';
import { initialState, onEvent, siteKey, type Event, type TrackerState } from './tracker';
import { localDay } from './tracker';
import { crossedThresholds, LIMITS_KEY, LIMITS_ENABLED_KEY, NOTIFIED_KEY, type DailyLimits } from './limits';
export const TIME_TRACKER_ID = 'time-tracker';
export const EXCLUDED_KEY = 'timeTrackerExcluded';
const SESSION_KEY = 'timeTrackerState', ALARM = 'time-tracker:flush';
const repo = createTimeTrackerRepo(backgroundDb);
let queue = Promise.resolve();
function schedule(action: () => Promise<void>): void { queue = queue.then(action).catch(e => console.debug('[Web Süre Takibi]', e)); }
async function load(): Promise<TrackerState> { const data = await chrome.storage.session.get(SESSION_KEY); return (data[SESSION_KEY] as TrackerState | undefined) ?? initialState(); }
async function apply(events: Event[]): Promise<void> {
  let state = await load(); const excluded = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[];
  for (const event of events) {
    const result = onEvent(state, event, Date.now());
    const chunks = result.chunks.filter(c => !excluded.includes(c.domain));
    const today = localDay(Date.now());
    const settings = await chrome.storage.local.get({ [LIMITS_KEY]: {}, [LIMITS_ENABLED_KEY]: false, [NOTIFIED_KEY]: {} });
    const limits = settings[LIMITS_KEY] as DailyLimits;
    const notified = settings[NOTIFIED_KEY] as Record<string, Record<string, string[]>>;
    for (const chunk of chunks) {
      const minutes = limits[chunk.domain];
      const active = settings[LIMITS_ENABLED_KEY] === true && chunk.day === today && Number.isInteger(minutes) && minutes >= 5 && minutes <= 1440;
      const before = active ? (await repo.getDay(today)).find(row => row.domain === chunk.domain)?.seconds ?? 0 : 0;
      await repo.addChunks([chunk]);
      if (!active) continue;
      const seen = notified[today]?.[chunk.domain] ?? [];
      for (const threshold of crossedThresholds(before, before + chunk.seconds, minutes)) {
        if (seen.includes(threshold)) continue;
        const message = threshold === '100' ? `${chunk.domain} için günlük limit doldu (${minutes} dk)` : `${chunk.domain}: limitin %80'i doldu`;
        await chrome.notifications.create(`time-limit:${today}:${chunk.domain}:${threshold}`, { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Günlük limitler', message, buttons: [{ title: 'Tamam' }] });
        seen.push(threshold);
        notified[today] = { ...notified[today], [chunk.domain]: seen };
        await chrome.storage.local.set({ [NOTIFIED_KEY]: { [today]: notified[today] } });
      }
    }
    state = result.state;
  }
  await chrome.storage.session.set({ [SESSION_KEY]: state });
}
async function sync(): Promise<void> {
  if (!(await isModuleEnabled(TIME_TRACKER_ID))) { await apply([{ type: 'windowFocus', focused: false }]); await chrome.alarms.clear(ALARM); return; }
  await chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  const [win, idle] = await Promise.all([chrome.windows.getLastFocused(), chrome.idle.queryState(60)]);
  const focused = !!win.focused; const tabs = focused && win.id !== undefined ? await chrome.tabs.query({ active: true, windowId: win.id }) : [];
  await apply([{ type: 'windowFocus', focused: false }, { type: 'activeUrl', url: tabs[0]?.url ?? null }, { type: 'idle', idle }, { type: 'windowFocus', focused }]);
}
export function initTimeTrackerBackground(): void {
  chrome.notifications.onButtonClicked.addListener((id, index) => { if (id.startsWith('time-limit:') && index === 0) void chrome.notifications.clear(id); });
  chrome.idle.setDetectionInterval(60);
  chrome.tabs.onActivated.addListener(() => schedule(sync));
  chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (change.url !== undefined && tab.active) schedule(sync); });
  chrome.windows.onFocusChanged.addListener(() => schedule(sync));
  chrome.idle.onStateChanged.addListener(idle => schedule(async () => { if (await isModuleEnabled(TIME_TRACKER_ID)) await apply([{ type: 'idle', idle }]); }));
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) schedule(async () => { if (await isModuleEnabled(TIME_TRACKER_ID)) await apply([{ type: 'flush' }]); else await sync(); }); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[EXCLUDED_KEY])) schedule(sync); });
  chrome.runtime.onStartup.addListener(() => schedule(sync)); chrome.runtime.onInstalled.addListener(() => schedule(sync));
  schedule(sync);
}
export { siteKey };
