import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTimeTrackerRepo } from './repo';
import { initialState, onEvent, siteKey, type Event, type TrackerState } from './tracker';
export const TIME_TRACKER_ID = 'time-tracker';
export const EXCLUDED_KEY = 'timeTrackerExcluded';
const SESSION_KEY = 'timeTrackerState', ALARM = 'time-tracker:flush';
const repo = createTimeTrackerRepo(backgroundDb);
let queue = Promise.resolve();
function schedule(action: () => Promise<void>): void { queue = queue.then(action).catch(e => console.debug('[Web S?re Takibi]', e)); }
async function load(): Promise<TrackerState> { const data = await chrome.storage.session.get(SESSION_KEY); return (data[SESSION_KEY] as TrackerState | undefined) ?? initialState(); }
async function apply(events: Event[]): Promise<void> {
  let state = await load(); const excluded = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[];
  for (const event of events) { const result = onEvent(state, event, Date.now()); await repo.addChunks(result.chunks.filter(c => !excluded.includes(c.domain))); state = result.state; }
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
