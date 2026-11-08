import assert from 'node:assert/strict';
import { test } from 'vitest';
import { MIGRATIONS, readVersion, runMigrations } from '../src/db/migrations';
import type { NoteCategory } from '../src/modules/slapmemo/categories';
import { buildFtsQuery, createNotesRepo } from '../src/modules/slapmemo/repo';
import { createMemoryExecutor } from './sqlite-memory';

async function setup() {
  const ex = await createMemoryExecutor();
  await runMigrations(ex);
  let clock = 1_000;
  const repo = createNotesRepo(ex, () => ++clock);
  return { ex, repo };
}

test('gerçek SQLite üzerinde migrasyonlar sürüm 6\'e ulaşır', async () => {
  const ex = await createMemoryExecutor();
  const result = await runMigrations(ex);
  assert.deepEqual(result.applied, MIGRATIONS.map(m => m.version));
  assert.equal(await readVersion(ex), Math.max(...MIGRATIONS.map(m => m.version)));
});

test('buildFtsQuery özel karakterleri ayıklar ve ı\'yı i yapar', () => {
  assert.equal(buildFtsQuery('çalışma "x" OR*'), '"çalişma"* "x"* "OR"*');
  assert.equal(buildFtsQuery('  !!! '), null);
});

test('addNote ekler ve alanları döndürür', async () => {
  const { repo } = await setup();
  const { note, duplicate } = await repo.addNote({
    category: 'read',
    text: '  Okunacak yazı  ',
    url: 'https://example.com/a',
    pageTitle: 'Örnek'
  });
  assert.equal(duplicate, false);
  assert.equal(note.category, 'read');
  assert.equal(note.text, 'Okunacak yazı');
  assert.equal(note.url, 'https://example.com/a');
  assert.equal(note.page_title, 'Örnek');
  assert.equal(note.user_note, null);
  assert.equal(note.created_at, note.updated_at);
});

test('listNotes en yeni önce, limit/offset ve kategori filtresi', async () => {
  const { repo } = await setup();
  await repo.addNote({ category: 'note', text: 'bir' });
  await repo.addNote({ category: 'idea', text: 'iki' });
  await repo.addNote({ category: 'note', text: 'üç' });

  const all = await repo.listNotes({ limit: 50 });
  assert.deepEqual(all.map(n => n.text), ['üç', 'iki', 'bir']);

  const page = await repo.listNotes({ limit: 1, offset: 1 });
  assert.deepEqual(page.map(n => n.text), ['iki']);

  const notes = await repo.listNotes({ category: 'note', limit: 50 });
  assert.deepEqual(notes.map(n => n.text), ['üç', 'bir']);
  assert.equal((await repo.listNotes({ category: 'watch', limit: 50 })).length, 0);
});

test('searchNotes Türkçe karakterleri bulur', async () => {
  const { repo } = await setup();
  await repo.addNote({ category: 'note', text: 'Yarınki çalışma planı' });
  await repo.addNote({ category: 'idea', text: 'Başka bir şey' });

  assert.equal((await repo.searchNotes('calisma')).length, 1);
  assert.equal((await repo.searchNotes('çalışma')).length, 1);
  assert.equal((await repo.searchNotes('ÇALIŞMA')).length, 1);
  assert.equal((await repo.searchNotes('cal')).length, 1); // önek
  assert.equal((await repo.searchNotes('yarinki plani')).length, 1);
  assert.equal((await repo.searchNotes('sey')).length, 1);
  assert.equal((await repo.searchNotes('yokboyle')).length, 0);
  assert.equal((await repo.searchNotes('   ')).length, 0);
});

test('searchNotes kategori filtresi, sayfa başlığı ve notum alanında arar', async () => {
  const { repo } = await setup();
  const a = await repo.addNote({ category: 'read', text: 'alfa', pageTitle: 'Güzel Makale' });
  await repo.addNote({ category: 'watch', text: 'alfa video' });

  assert.equal((await repo.searchNotes('alfa')).length, 2);
  assert.deepEqual((await repo.searchNotes('alfa', 'watch')).map(n => n.text), ['alfa video']);
  assert.equal((await repo.searchNotes('guzel')).length, 1);

  await repo.updateUserNote(a.note.id, 'öğleden sonra bak');
  assert.equal((await repo.searchNotes('ogleden')).length, 1);
});

test('updateUserNote günceller, boş değer temizler, olmayan kayıt null döner', async () => {
  const { repo } = await setup();
  const { note } = await repo.addNote({ category: 'note', text: 'x' });

  const updated = await repo.updateUserNote(note.id, '  benim notum ');
  assert.equal(updated?.user_note, 'benim notum');
  assert.ok((updated?.updated_at ?? 0) > note.updated_at);

  const cleared = await repo.updateUserNote(note.id, '   ');
  assert.equal(cleared?.user_note, null);

  assert.equal(await repo.updateUserNote(9999, 'y'), null);
});

test('setCategory kategoriyi ve güncelleme zamanını değiştirir', async () => {
  const { repo } = await setup();
  const { note } = await repo.addNote({ category: 'note', text: 'örnek' });
  const updated = await repo.setCategory(note.id, 'watch');
  assert.equal(updated?.category, 'watch');
  assert.ok((updated?.updated_at ?? 0) > note.updated_at);
  assert.equal(await repo.setCategory(9999, 'read'), null);
});

test('deleteNote listeden ve aramadan kaldırır', async () => {
  const { repo } = await setup();
  const { note } = await repo.addNote({ category: 'note', text: 'silinecek kayıt' });
  assert.equal((await repo.searchNotes('silinecek')).length, 1);

  await repo.deleteNote(note.id);
  assert.equal((await repo.listNotes({ limit: 50 })).length, 0);
  assert.equal((await repo.searchNotes('silinecek')).length, 0);
});

test('aynı url + aynı metin yeniden kaydedilirse mevcut not döner', async () => {
  const { repo } = await setup();
  const first = await repo.addNote({ category: 'note', text: 'aynı', url: 'https://a.test/' });
  const again = await repo.addNote({ category: 'idea', text: 'aynı', url: 'https://a.test/' });
  assert.equal(again.duplicate, true);
  assert.equal(again.note.id, first.note.id);
  assert.equal((await repo.listNotes({ limit: 50 })).length, 1);

  const otherUrl = await repo.addNote({ category: 'note', text: 'aynı', url: 'https://b.test/' });
  const otherText = await repo.addNote({ category: 'note', text: 'farklı', url: 'https://a.test/' });
  assert.equal(otherUrl.duplicate, false);
  assert.equal(otherText.duplicate, false);
  assert.equal((await repo.listNotes({ limit: 50 })).length, 3);
});

test('geçersiz kategori CHECK kısıtına takılır', async () => {
  const { repo } = await setup();
  await assert.rejects(() => repo.addNote({ category: 'bogus' as NoteCategory, text: 'x' }));
  assert.equal((await repo.listNotes({ limit: 50 })).length, 0);
});

test('boş metin reddedilir', async () => {
  const { repo } = await setup();
  await assert.rejects(() => repo.addNote({ category: 'note', text: '   ' }), /boş/);
});
