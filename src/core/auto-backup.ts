export const AUTO_BACKUP_ENABLED_KEY = 'autoBackupEnabled';
export const LAST_AUTO_BACKUP_KEY = 'lastAutoBackupAt';
export const AUTO_BACKUP_ALARM = 'lifetools-auto-backup';
export const BACKUP_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function isBackupDue(last: unknown, now: number): boolean {
  const time = typeof last === 'string' ? Date.parse(last) : typeof last === 'number' ? last : NaN;
  return !Number.isFinite(time) || now - time >= BACKUP_WEEK_MS;
}

export function backupFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `LifeTools/Yedekler/lifetools-yedek-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}
