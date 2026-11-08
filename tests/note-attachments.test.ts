import { expect, test } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createNotesRepo } from '../src/modules/slapmemo/repo';
import { exportData, restoreData, validateBackup } from '../src/core/backup';

test('version 8 upgrades, attachments survive backup and delete with their note', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex, MIGRATIONS.filter(m => m.version <= 8));
  expect(await runMigrations(ex)).toEqual({ from: 8, to: 9, applied: [9] });
  const repo = createNotesRepo(ex);
  const { note } = await repo.addNote({ category: 'note', text: 'Sayfa' });
  await repo.savePage(note.id, 'İçerik'); await repo.saveImage(note.id, 'data:image/jpeg;base64,YQ==', 10, 10);
  const backup = validateBackup(await exportData(ex, {}, 100));
  expect(backup.tables.note_pages).toHaveLength(1); expect(backup.tables.note_images).toHaveLength(1);
  await repo.deleteNote(note.id);
  expect(await repo.getPage(note.id)).toBeNull(); expect(await repo.getImage(note.id)).toBeNull();
  await restoreData(ex, backup);
  expect((await repo.getPage(note.id))?.text).toBe('İçerik');
  expect((await repo.getImage(note.id))?.data_url).toBe('data:image/jpeg;base64,YQ==');
});

test('old backups accept missing attachment tables', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  const backup = await exportData(ex, {});
  const old = JSON.parse(JSON.stringify(backup)); old.schema_version = 8;
  delete old.tables.note_pages; delete old.tables.note_images;
  const validated = validateBackup(old);
  expect(validated.tables.note_pages).toEqual([]); expect(validated.tables.note_images).toEqual([]);
  await restoreData(ex, validated);
});
