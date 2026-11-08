import { expect, test } from 'vitest';
import { BACKUP_WEEK_MS, backupFilename, isBackupDue } from '../src/core/auto-backup';

test('backup is due when absent, invalid, or at least a week old', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  expect(isBackupDue(undefined, now)).toBe(true);
  expect(isBackupDue('invalid', now)).toBe(true);
  expect(isBackupDue(new Date(now - BACKUP_WEEK_MS).toISOString(), now)).toBe(true);
  expect(isBackupDue(now - BACKUP_WEEK_MS + 1, now)).toBe(false);
  expect(isBackupDue(now + 1, now)).toBe(false);
});

test('backup filename uses the local calendar date', () => {
  expect(backupFilename(new Date(2026, 10, 8, 21, 40))).toBe('LifeTools/Yedekler/lifetools-yedek-2026-11-08.json');
  expect(backupFilename(new Date(2026, 0, 2))).toBe('LifeTools/Yedekler/lifetools-yedek-2026-01-02.json');
});
