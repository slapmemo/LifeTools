import { exportBackground } from '../db/host';
import { backupSettingKeys } from './backup-settings';
import { AUTO_BACKUP_ALARM, AUTO_BACKUP_ENABLED_KEY, BACKUP_WEEK_MS, LAST_AUTO_BACKUP_KEY, backupFilename, isBackupDue } from './auto-backup';

let pending: Promise<void> | undefined;
const LAST_ERROR_KEY = 'autoBackup.lastError';

/** Uses the active backend and pages reads for the desktop bridge. */
export async function buildBackupJson(): Promise<string> {
  const settings = await chrome.storage.local.get(backupSettingKeys());
  return JSON.stringify(await exportBackground(settings, 100), null, 2);
}

export function downloadBackup(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const json = await buildBackupJson();
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const now = new Date();
    await chrome.downloads.download({ url: `data:application/json;base64,${btoa(binary)}`, filename: backupFilename(now), conflictAction: 'overwrite', saveAs: false });
    await chrome.storage.local.set({ [LAST_AUTO_BACKUP_KEY]: now.toISOString(), [LAST_ERROR_KEY]: null });
  })().catch(async err => {
    await chrome.storage.local.set({ [LAST_ERROR_KEY]: { at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }).finally(() => { pending = undefined; });
  return pending;
}

async function syncAlarm(): Promise<void> {
  const data = await chrome.storage.local.get({ [AUTO_BACKUP_ENABLED_KEY]: true });
  if (data[AUTO_BACKUP_ENABLED_KEY] === false) { await chrome.alarms.clear(AUTO_BACKUP_ALARM); return; }
  if (!await chrome.alarms.get(AUTO_BACKUP_ALARM)) await chrome.alarms.create(AUTO_BACKUP_ALARM, { periodInMinutes: BACKUP_WEEK_MS / 60000 });
}

async function checkDue(): Promise<void> {
  await syncAlarm();
  const data = await chrome.storage.local.get([AUTO_BACKUP_ENABLED_KEY, LAST_AUTO_BACKUP_KEY]);
  if (data[AUTO_BACKUP_ENABLED_KEY] !== false && isBackupDue(data[LAST_AUTO_BACKUP_KEY], Date.now())) await downloadBackup();
}

export function initAutoBackup(): void {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === AUTO_BACKUP_ALARM) void checkDue().catch(console.error);
  });
  chrome.runtime.onStartup.addListener(() => { void checkDue().catch(console.error); });
  chrome.runtime.onInstalled.addListener(() => { void syncAlarm().catch(console.error); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[AUTO_BACKUP_ENABLED_KEY]) void syncAlarm().catch(console.error);
  });
}
