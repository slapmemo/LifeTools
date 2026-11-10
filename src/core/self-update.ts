import { desktopVersion } from './desktop-version';
import { selfUpdateAction } from './version';

export const SELF_UPDATE_ALARM = 'lifetools-self-update';
export const LAST_RELOAD_KEY = 'selfUpdate.lastReloadFor';
export const MANAGED_DIR_HINT_KEY = 'selfUpdate.unmanagedDir';
const PERIOD_MINUTES = 30;

/** Masaüstünün yönettiği eklenti klasörü daha yeniyse eklentiyi yeniden yükler. */
export async function checkSelfUpdate(): Promise<void> {
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
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SELF_UPDATE_ALARM) void checkSelfUpdate().catch(() => undefined);
  });
  void (async () => {
    try {
      if (!await chrome.alarms.get(SELF_UPDATE_ALARM)) await chrome.alarms.create(SELF_UPDATE_ALARM, { periodInMinutes: PERIOD_MINUTES });
      await checkSelfUpdate();
    } catch {
      /* masaüstü yok ya da API kullanılamıyor */
    }
  })();
}
