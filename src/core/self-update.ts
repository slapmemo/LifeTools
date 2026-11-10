import { desktopVersion } from './desktop-version';
import { selfUpdateAction } from './version';

export const SELF_UPDATE_ALARM = 'lifetools-self-update';
export const LAST_RELOAD_KEY = 'selfUpdate.lastReloadFor';
export const MANAGED_DIR_HINT_KEY = 'selfUpdate.unmanagedDir';
const PERIOD_MINUTES = 30;
export const LAST_CHECK_KEY = 'selfUpdate.lastCheck';
export function shouldCheckSelfUpdate(last: unknown, now: number): boolean {
  return typeof last !== 'number' || !Number.isFinite(last) || last > now || now - last >= 10 * 60 * 1000;
}
let checkInFlight: Promise<void> | null = null;

/** Masaüstünün yönettiği eklenti klasörü daha yeniyse eklentiyi yeniden yükler. */
export function checkSelfUpdate(): Promise<void> {
  if (checkInFlight) return checkInFlight;
  const check = performSelfUpdateCheck();
  checkInFlight = check;
  void check.finally(() => { if (checkInFlight === check) checkInFlight = null; }).catch(() => {});
  return check;
}

async function performSelfUpdateCheck(): Promise<void> {
  const now = Date.now();
  const lastCheck = (await chrome.storage.local.get(LAST_CHECK_KEY))[LAST_CHECK_KEY];
  if (!shouldCheckSelfUpdate(lastCheck, now)) return;
  await chrome.storage.local.set({ [LAST_CHECK_KEY]: now });
  const ping = await desktopVersion();
  if (!ping) return;
  const current = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get(LAST_RELOAD_KEY);
  const last = typeof stored[LAST_RELOAD_KEY] === 'string' ? stored[LAST_RELOAD_KEY] as string : null;
  const action = selfUpdateAction(current, ping.extensionVersion, last);
  if (action === 'reload') {
    await chrome.storage.local.set({ [LAST_RELOAD_KEY]: ping.extensionVersion });
    chrome.runtime.reload();
  } else if (action === 'unmanaged') {
    if (ping.extensionDir) await chrome.storage.local.set({ [MANAGED_DIR_HINT_KEY]: ping.extensionDir });
  } else {
    await chrome.storage.local.remove(MANAGED_DIR_HINT_KEY);
  }
}

export function initSelfUpdate(): void {
  const check = () => { void checkSelfUpdate().catch(() => undefined); };
  chrome.runtime.onInstalled.addListener(check);
  chrome.runtime.onStartup.addListener(check);
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SELF_UPDATE_ALARM) void checkSelfUpdate().catch(() => undefined);
  });
  void (async () => {
    try {
      if (!await chrome.alarms.get(SELF_UPDATE_ALARM)) await chrome.alarms.create(SELF_UPDATE_ALARM, { periodInMinutes: PERIOD_MINUTES });
    } catch {
      /* masaüstü yok ya da API kullanılamıyor */
    }
  })();
}
