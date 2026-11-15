import { expect, test } from 'vitest';
import { runMigrations } from '../src/db/migrations';
import { createSessionsRepo, HIDDEN_PREFIX } from '../src/modules/life-browser/repo';
import { exportPlain, exportMarkdown, resolveShortcutTarget, filterSavedGroup } from '../src/modules/tab-manager/logic';
import { exportData, restoreData, validateBackup } from '../src/core/backup';
import { createMemoryExecutor } from './sqlite-memory';

test('notes survive moves and backup, and older backups restore', async () => {
  const db = await createMemoryExecutor(); await runMigrations(db);
  const repo = createSessionsRepo(db);
  const input = { url: 'https://example.com', title: 'A', pinned: false, group_title: 'A', group_color: 'orange', note: ' first ' };
  const a = await repo.save('A', [input]); const b = await repo.save('B', [input]);
  const row = (await repo.tabs(a))[0]; await repo.setTabNote(a, row.id, '  hello  ');
  await repo.moveTab(a, row.id, b);
  expect((await repo.tabs(b)).map(t => t.note)).toEqual([' first ', 'hello']);
  const backup = await exportData(db, {}); await restoreData(db, validateBackup(backup));
  expect((await repo.tabs(b))[1].note).toBe('hello');
  backup.schema_version = 9; for (const tab of backup.tables.session_tabs) delete tab.note;
  await restoreData(db, validateBackup(backup)); expect((await repo.tabs(b))[1].note).toBeNull();
});

test('exports, search, and shortcut target', () => {
  const tabs = [{ title: 'A [B](C)', url: 'https://example.com', note: 'memo' }];
  expect(exportPlain('Group', tabs)).toBe('Group\n\nA [B](C) \u2014 https://example.com\n  Not: memo');
  expect(exportMarkdown('Group', tabs)).toContain('A \\[B\\]\\(C\\)');
  expect(filterSavedGroup('Group', tabs, 'memo').tabs).toHaveLength(1);
  const sessions = [{ id: 1, name: HIDDEN_PREFIX + 'Sonra', created_at: 1, tab_count: 1 }, { id: 2, name: HIDDEN_PREFIX + 'Sonra', created_at: 2, tab_count: 1 }];
  expect(resolveShortcutTarget(sessions, 1)?.id).toBe(1); expect(resolveShortcutTarget(sessions, 99)?.id).toBe(2);
});
