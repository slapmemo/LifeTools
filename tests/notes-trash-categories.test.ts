import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { MIGRATIONS, NOTE_EXTRA_DDL, runMigrations } from '../src/db/migrations';
import { createNotesRepo } from '../src/modules/slapmemo/repo';
import { exportData, restoreData, validateBackup } from '../src/core/backup';

const DAY = 86_400_000;

async function setup(start = 1_000_000) {
  const ex = await createMemoryExecutor();
  await runMigrations(ex);
  let t = start;
  const clock = { now: () => t, advance: (d: number) => { t += d; } };
  const repo = createNotesRepo(ex, () => t++);
  return { ex, repo, clock };
}

test('migrasyon 13, masaüstündeki NOTE_EXTRA_DDL ile birebir aynı', () => {
  const rust = readFileSync(new URL('../desktop/src-tauri/src/db/notes.rs', import.meta.url), 'utf8');
  expect(NOTE_EXTRA_DDL).toHaveLength(9);
  expect(MIGRATIONS.find(m => m.version === 13)!.statements).toEqual([...NOTE_EXTRA_DDL]);
  for (const statement of NOTE_EXTRA_DDL) expect(rust).toContain(`"${statement}"`);
});

test('migrasyon iki sırada da aynı şemayı verir (eklenti önce / masaüstü önce)', async () => {
  const schema = async (ex: Awaited<ReturnType<typeof createMemoryExecutor>>) =>
    ex.query<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE name IN ('note_extra','note_categories','note_history','idx_note_extra_deleted','idx_note_history_note') ORDER BY name");
  const first = await createMemoryExecutor();
  await runMigrations(first);

  const second = await createMemoryExecutor();
  await runMigrations(second, MIGRATIONS.filter(m => m.version <= 12));
  // masaüstü, eklentiden önce aynı ifadeleri çalıştırır; kullanıcının sildiği kategori sonradan geri gelmemeli
  for (const s of NOTE_EXTRA_DDL) await second.exec(s);
  await second.exec("DELETE FROM note_categories WHERE id = 'read'");
  expect(await runMigrations(second)).toEqual({ from: 12, to: 13, applied: [13] });
  expect(await schema(second)).toEqual(await schema(first));
  expect((await second.query<{ id: string }>('SELECT id FROM note_categories ORDER BY position')).map(r => r.id)).toEqual(['note', 'watch', 'idea']);
  expect((await first.query<{ id: string; label: string; builtin: number }>('SELECT id, label, builtin FROM note_categories ORDER BY position')).map(r => `${r.id}:${r.label}:${r.builtin}`))
    .toEqual(['note:Notlar:1', 'read:Okunacaklar:1', 'watch:İzlenecekler:1', 'idea:Fikirler:1']);
  // notes.category sabit CHECK kısıtı gevşetildi
  const sql = (await first.query<{ sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'notes'"))[0].sql;
  expect(sql).not.toContain("'read'");
});

test('eski veritabanı (12) migrasyondan sonra aynı notları gösterir', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex, MIGRATIONS.filter(m => m.version <= 12));
  await ex.exec("INSERT INTO notes (category, text, created_at, updated_at) VALUES ('read', 'Eski not', 1, 1)");
  await ex.exec('INSERT INTO note_meta (note_id, pinned) VALUES (1, 1)');
  await runMigrations(ex);
  const repo = createNotesRepo(ex);
  expect((await repo.listNotes()).map(n => [n.id, n.category, n.text])).toEqual([[1, 'read', 'Eski not']]);
  expect(await repo.searchNotes('eski')).toHaveLength(1);
});

test('çöpe atılan not listede, aramada, sayfa ipucunda görünmez; geri yüklenir; kalıcı silinir', async () => {
  const { ex, repo } = await setup();
  const a = (await repo.addNote({ category: 'note', text: 'Elma notu', url: 'https://a.test/x' })).note;
  const b = (await repo.addNote({ category: 'note', text: 'Armut notu', url: 'https://a.test/x' })).note;
  await repo.savePage(b.id, 'sayfa'); await repo.saveImage(b.id, 'data:image/jpeg;base64,YQ==', 1, 1);
  await repo.deleteNote(b.id);
  expect((await repo.listNotes()).map(n => n.id)).toEqual([a.id]);
  expect(await repo.searchNotes('armut')).toEqual([]);
  expect((await repo.notesForUrl('https://a.test/x')).map(n => n.id)).toEqual([a.id]);
  expect((await repo.listTrash()).map(n => [n.id, typeof n.deleted_at])).toEqual([[b.id, 'number']]);
  expect(await repo.trashCount()).toBe(1);
  // aynı url+metin yeniden eklenince çöpteki kopya "duplicate" sayılmaz
  const again = await repo.addNote({ category: 'note', text: 'Armut notu', url: 'https://a.test/x' });
  expect(again.duplicate).toBe(false);
  await repo.restoreNote(b.id);
  expect((await repo.listNotes()).map(n => n.id).sort()).toEqual([a.id, b.id, again.note.id].sort());
  await repo.deleteNote(b.id);
  await repo.purgeNote(b.id);
  expect(await repo.getPage(b.id)).toBeNull(); expect(await repo.getImage(b.id)).toBeNull();
  expect(await ex.query('SELECT 1 FROM note_extra WHERE note_id = ?', [b.id])).toEqual([]);
  // ekran görüntüsü geri almasında kullanılan sert silme çöpe uğramaz
  await repo.hardDeleteNote(a.id);
  expect(await repo.listTrash()).toEqual([]);
  expect(await ex.query('SELECT 1 FROM notes WHERE id = ?', [a.id])).toEqual([]);
});

test('purgeExpired 15 gün sonra siler (zaman taşınarak); emptyTrash hepsini', async () => {
  const { ex, repo, clock } = await setup(10 * DAY);
  const a = (await repo.addNote({ category: 'note', text: 'Bir' })).note;
  const b = (await repo.addNote({ category: 'note', text: 'İki' })).note;
  const c = (await repo.addNote({ category: 'note', text: 'Üç' })).note;
  await repo.savePage(a.id, 'p');
  await repo.deleteNote(a.id);
  clock.advance(10 * DAY);
  await repo.deleteNote(b.id);
  expect(await repo.purgeExpired(clock.now() + 4 * DAY)).toBe(0);   // a: 14 gün
  expect(await repo.purgeExpired(clock.now() + 6 * DAY)).toBe(1);   // a: 16 gün, b: 6 gün
  expect((await repo.listTrash()).map(n => n.id)).toEqual([b.id]);
  expect(await repo.getPage(a.id)).toBeNull();
  expect(await ex.query('SELECT 1 FROM notes WHERE id = ?', [a.id])).toEqual([]);
  expect(await repo.emptyTrash()).toBe(1);
  expect((await repo.listNotes()).map(n => n.id)).toEqual([c.id]);
});

test('kategori ekle/yeniden adlandır/renk/sırala; silinen kategorinin notları Notlar\'a taşınır', async () => {
  const { repo } = await setup();
  const cat = await repo.addCategory('  İş Fikirleri ', 'blue');
  expect(cat.id).toBe('is-fikirleri');
  expect((await repo.addCategory('İş fikirleri')).id).toBe('is-fikirleri-2');
  expect(await repo.categoryExists('is-fikirleri')).toBe(true);
  const a = (await repo.addNote({ category: cat.id, text: 'A' })).note;
  const b = (await repo.addNote({ category: cat.id, text: 'B' })).note;
  await repo.deleteNote(b.id);  // çöptekiler de taşınır
  await expect(repo.addNote({ category: 'yok', text: 'X' })).rejects.toThrow('Geçersiz kategori');
  await expect(repo.deleteCategory('note')).rejects.toThrow();
  expect(await repo.deleteCategory(cat.id)).toBe(2);
  expect((await repo.listNotes({ category: 'note' })).map(n => n.id)).toEqual([a.id]);
  expect((await repo.listTrash())[0].category).toBe('note');
  expect(await repo.categoryExists(cat.id)).toBe(false);
  await repo.renameCategory('read', 'Okuma Listesi'); await repo.recolorCategory('read', 'green');
  await repo.reorderCategories(['idea', 'note']);
  const list = await repo.listCategories();
  expect(list[0].id).toBe('idea');
  expect(list.find(c => c.id === 'read')).toMatchObject({ label: 'Okuma Listesi', color: 'green' });
  await expect(repo.recolorCategory('read', 'a b')).rejects.toThrow();
});

test('renk ve elle sıralama; sabitlenenler yine üstte', async () => {
  const { ex, repo } = await setup();
  const a = (await repo.addNote({ category: 'note', text: 'A' })).note;
  const b = (await repo.addNote({ category: 'note', text: 'B' })).note;
  const c = (await repo.addNote({ category: 'note', text: 'C' })).note;
  await repo.setNoteColor(a.id, 'pink');
  expect((await repo.listNotes()).find(n => n.id === a.id)?.color).toBe('pink');
  await expect(repo.setNoteColor(a.id, 'red')).rejects.toThrow();
  await repo.setNoteColor(a.id, null);
  expect((await repo.listNotes()).find(n => n.id === a.id)?.color).toBeNull();
  await repo.reorder([a.id, c.id, b.id]);
  expect((await repo.listNotes({ sort: 'manual' })).map(n => n.id)).toEqual([a.id, c.id, b.id]);
  expect((await repo.listNotes()).map(n => n.id)).toEqual([c.id, b.id, a.id]);
  await ex.exec('INSERT INTO note_meta (note_id, pinned) VALUES (?, 1)', [b.id]);
  expect((await repo.listNotes({ sort: 'manual' })).map(n => n.id)).toEqual([b.id, a.id, c.id]);
  await repo.setNotePosition(c.id, -5);
  expect((await repo.listNotes({ sort: 'manual' }))[1].id).toBe(c.id);
});

test('geçmiş: 5 dk içinde birleşir, 30 ile sınırlı, 60 günden eski silinir, geri yükleme mevcut metni saklar', async () => {
  const { ex, repo, clock } = await setup(1_800_000_000_000);
  const { note } = await repo.addNote({ category: 'note', text: 'v0' });
  const min = 60_000;
  clock.advance(min);
  await repo.updateNote(note.id, 'v1', '');           // v0 geçmişe
  clock.advance(2 * min);
  await repo.updateNote(note.id, 'v2', '');           // 5 dk içinde: yazılmaz
  expect((await repo.listHistory(note.id)).map(h => h.text)).toEqual(['v0']);
  await repo.updateNoteText(note.id, 'v2');           // aynı metin: yazılmaz
  clock.advance(10 * min);
  await repo.updateNoteText(note.id, 'v3');
  expect((await repo.listHistory(note.id)).map(h => h.text)).toEqual(['v2', 'v0']);
  for (let i = 0; i < 40; i++) { clock.advance(6 * min); await repo.updateNote(note.id, `x${i}`, ''); }
  expect(await repo.listHistory(note.id)).toHaveLength(30);
  clock.advance(61 * DAY);
  await repo.updateNote(note.id, 'son', '');
  expect((await repo.listHistory(note.id)).map(h => h.text)).toEqual(['x39']);
  const h = (await repo.listHistory(note.id))[0];
  expect((await repo.restoreHistory(h.id))?.text).toBe('x39');
  expect((await repo.listHistory(note.id)).map(x => x.text)).toContain('son');
  expect(await repo.restoreHistory(99999)).toBeNull();
  await repo.purgeNote(note.id);
  expect(await ex.query('SELECT 1 FROM note_history')).toEqual([]);
});

test('not sınırı 50 000 karakter', async () => {
  const { repo } = await setup();
  await repo.addNote({ category: 'note', text: 'a'.repeat(50_000) });
  await expect(repo.addNote({ category: 'note', text: 'a'.repeat(50_001) })).rejects.toThrow('50 000');
});

test('yedek yeni tabloları taşır; eski yedek geri yüklenince dört kategori yerine gelir', async () => {
  const { ex, repo } = await setup();
  const { note } = await repo.addNote({ category: 'note', text: 'Not' });
  await repo.setNoteColor(note.id, 'blue'); await repo.addCategory('Özel');
  await repo.updateNoteText(note.id, 'Yeni');
  await repo.deleteNote(note.id);
  const backup = validateBackup(JSON.parse(JSON.stringify(await exportData(ex, {}))));
  expect(backup.tables.note_extra).toHaveLength(1); expect(backup.tables.note_categories).toHaveLength(5); expect(backup.tables.note_history).toHaveLength(1);
  await restoreData(ex, backup);
  expect((await repo.listTrash()).map(n => [n.id, n.color])).toEqual([[note.id, 'blue']]);
  expect(await repo.categoryExists('ozel')).toBe(true);

  const old = JSON.parse(JSON.stringify(backup)); old.schema_version = 12;
  for (const t of ['note_extra', 'note_categories', 'note_history']) delete old.tables[t];
  const validated = validateBackup(old);
  expect(validated.tables.note_categories).toEqual([]);
  await restoreData(ex, validated);
  expect((await repo.listCategories()).map(c => c.id)).toEqual(['note', 'read', 'watch', 'idea']);
  expect(await repo.listTrash()).toEqual([]);
  expect((await repo.listNotes()).map(n => n.text)).toEqual(['Yeni']);
});

test('kategori kimliği ortak test vektörleriyle (masaüstüyle aynı) üretilir', async () => {
  const { slugifyCategoryId } = await import('../src/modules/slapmemo/categories');
  const vectors = JSON.parse(readFileSync(new URL('./fixtures/category-slugs.json', import.meta.url), 'utf8')) as Array<[string, string]>;
  for (const [input, expected] of vectors) expect(slugifyCategoryId(input), input).toBe(expected);
});

test('migrasyon 13 şema çerezini artırır ve bütünlük denetimi yapar', async () => {
  const ex = await createMemoryExecutor();
  await runMigrations(ex, MIGRATIONS.filter(m => m.version <= 12));
  const before = Number((await ex.query<{ schema_version: number }>('PRAGMA schema_version'))[0].schema_version);
  await runMigrations(ex);
  const after = Number((await ex.query<{ schema_version: number }>('PRAGMA schema_version'))[0].schema_version);
  expect(after).toBeGreaterThan(before + 1); // DDL'lerin kendi artışlarının üstünde ek +1
});
