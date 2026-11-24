import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { runMigrations } from '../src/db/migrations';
import { createNotesRepo, reorderScope } from '../src/modules/slapmemo/repo';
import { createMemoryExecutor } from './sqlite-memory';

interface Case { name: string; category: string | null; notes: Array<{ id: number; position: number | null; created_at: number; pinned: boolean; category: string }>; ids: number[]; expected: number[] }
const cases = (JSON.parse(readFileSync('tests/fixtures/note-reorder.json', 'utf8')) as { cases: Case[] }).cases;

for (const c of cases) {
  test(`reorder: ${c.name}`, async () => {
    const ex = await createMemoryExecutor();
    await runMigrations(ex);
    const repo = createNotesRepo(ex);
    for (const cat of new Set(c.notes.map(n => n.category))) if (!(await repo.categoryExists(cat))) await ex.exec('INSERT INTO note_categories (id, label, color, position, builtin, created_at) VALUES (?, ?, NULL, 9, 0, 0)', [cat, cat]);
    for (const n of c.notes) {
      await ex.exec('INSERT INTO notes (id, category, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [n.id, n.category, `n${n.id}`, n.created_at, n.created_at]);
      if (n.position !== null) await repo.setNotePosition(n.id, n.position);
      if (n.pinned) await ex.exec('INSERT INTO note_meta (note_id, pinned) VALUES (?, 1)', [n.id]);
    }
    await repo.reorder(c.ids, c.category, { transaction: true });
    const pinned = new Set(c.notes.filter(n => n.pinned).map(n => n.id));
    const group = pinned.has(c.ids[0]);
    const listed = await repo.listNotes({ category: c.category, sort: 'manual', limit: 1000 });
    assert.deepEqual(listed.map(n => n.id).filter(id => pinned.has(id) === group), c.expected);
    // Kapsam içinde konumlar çakışmasız 0..n-1 olmalı.
    const positions = listed.filter(n => pinned.has(n.id) === group).map(n => n.position);
    assert.deepEqual(positions, c.expected.map((_, i) => i));
  });
}

test('reorderScope yuvalara yerleştirir', () => {
  assert.deepEqual(reorderScope([1, 2, 3, 4, 5], [4, 2]), [1, 4, 3, 2, 5]);
});
