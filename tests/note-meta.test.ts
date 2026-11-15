import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { MIGRATIONS, runMigrations } from '../src/db/migrations';
import { createNotesRepo } from '../src/modules/slapmemo/repo';
import { exportData, restoreData, validateBackup } from '../src/core/backup';

const migration11 = MIGRATIONS.find(m => m.version === 11)!;

test('migrasyon 11, masaüstündeki note_meta tanımıyla birebir aynı', () => {
  const rust = readFileSync(new URL('../desktop/src-tauri/src/db/notes.rs', import.meta.url), 'utf8');
  for (const statement of migration11.statements) expect(rust).toContain(`"${statement}"`);
});

test('masaüstü note_meta tablosunu önce oluşturduysa migrasyon 11 yine başarılı', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex, MIGRATIONS.filter(m => m.version <= 10));
  for (const statement of migration11.statements) await ex.exec(statement);
  expect(await runMigrations(ex)).toEqual({ from: 10, to: 11, applied: [11] });
});

test('arşivlenen not listede ve aramada görünmez, sabitlenen önce gelir, silmede meta temizlenir', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex);
  let t = 1000;
  const repo = createNotesRepo(ex, () => t++);
  const a = (await repo.addNote({ category: 'note', text: 'Elma notu' })).note;
  const b = (await repo.addNote({ category: 'note', text: 'Armut notu' })).note;
  const c = (await repo.addNote({ category: 'read', text: 'Kiraz notu' })).note;
  expect((await repo.listNotes()).map(n => n.id)).toEqual([c.id, b.id, a.id]);

  await ex.exec('INSERT INTO note_meta (note_id, pinned) VALUES (?, 1)', [a.id]);
  await ex.exec('INSERT INTO note_meta (note_id, archived_at) VALUES (?, 5)', [b.id]);
  expect((await repo.listNotes()).map(n => n.id)).toEqual([a.id, c.id]);
  expect((await repo.listNotes({ category: 'note' })).map(n => n.id)).toEqual([a.id]);
  expect((await repo.listNotes())[0]).not.toHaveProperty('archived_at');
  expect((await repo.searchNotes('armut')).map(n => n.id)).toEqual([]);
  expect((await repo.searchNotes('elma')).map(n => n.id)).toEqual([a.id]);

  const backup = validateBackup(await exportData(ex, {}));
  expect(backup.tables.note_meta).toHaveLength(2);

  await repo.deleteNote(a.id);
  expect(await ex.query('SELECT * FROM note_meta WHERE note_id = ?', [a.id])).toEqual([]);

  await restoreData(ex, backup);
  expect(await ex.query<{ pinned: number }>('SELECT pinned FROM note_meta WHERE note_id = ?', [a.id])).toEqual([{ pinned: 1 }]);
});

test('note_meta olmayan eski yedek kabul edilir', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex);
  const old = JSON.parse(JSON.stringify(await exportData(ex, {})));
  old.schema_version = 10;
  delete old.tables.note_meta;
  expect(validateBackup(old).tables.note_meta).toEqual([]);
});
