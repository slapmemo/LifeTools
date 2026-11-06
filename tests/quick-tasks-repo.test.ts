import assert from 'node:assert/strict';
import { test } from 'vitest';
import { runMigrations } from '../src/db/migrations';
import { createTasksRepo } from '../src/modules/quick-tasks/repo';
import { createMemoryExecutor } from './sqlite-memory';

async function setup() {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  let clock = new Date(2026, 10, 6, 12).getTime();
  return createTasksRepo(ex, () => ++clock);
}
test('ekleme, güncelleme ve doğrulama', async () => {
  const repo = await setup();
  const task = await repo.add({ title: '  Görev  ', note: 'Not', url: 'https://example.com', due_date: '2024-02-29' });
  assert.equal(task.title, 'Görev'); assert.equal(task.note, 'Not'); assert.equal(task.due_date, '2024-02-29');
  assert.equal((await repo.update(task.id, { title: ' Yeni ' }))?.title, 'Yeni');
  assert.equal(await repo.update(999, { title: 'Yok' }), null);
  for (const title of ['   ', 'x'.repeat(301)]) await assert.rejects(() => repo.add({ title }), /ba\u015fl\u0131\u011f\u0131/);
  for (const due_date of ['2023-02-29', '2026-13-01', '2026-04-31', '2026-1-01']) {
    await assert.rejects(() => repo.add({ title: 'x', due_date }), /tarih/);
    await assert.rejects(() => repo.update(task.id, { title: 'x', due_date }), /tarih/);
  }
});
test('açık görevler tarih ve oluşturulma sırasına göre listelenir', async () => {
  const repo = await setup();
  for (const [title, due_date] of [['tarihsiz', null], ['gelecek', '2026-11-08'], ['geç', '2026-11-05'], ['bugün', '2026-11-06'], ['eski', '2026-11-01'], ['tarihsiz 2', null]] as const) await repo.add({ title, due_date });
  assert.deepEqual((await repo.listOpen()).map(t => t.title), ['eski', 'geç', 'bugün', 'gelecek', 'tarihsiz', 'tarihsiz 2']);
});
test('tamamla, geri al, sil ve yalnızca tamamlananları temizle', async () => {
  const repo = await setup(); const a = await repo.add({ title: 'a' }); const b = await repo.add({ title: 'b' });
  assert.notEqual((await repo.toggleDone(a.id))?.done_at, null);
  assert.equal((await repo.listDone())[0].id, a.id);
  assert.equal((await repo.toggleDone(a.id))?.done_at, null);
  await repo.toggleDone(a.id); await repo.toggleDone(b.id);
  assert.deepEqual((await repo.listDone()).map(t => t.id), [b.id, a.id]);
  await repo.toggleDone(b.id); await repo.clearDone();
  assert.deepEqual((await repo.listOpen()).map(t => t.id), [b.id]); assert.equal((await repo.listDone()).length, 0);
  await repo.delete(b.id); assert.equal((await repo.listOpen()).length, 0);
});
test('tamamlananlar son 50 kayıtla sınırlıdır', async () => {
  const repo = await setup();
  for (let i = 0; i < 51; i++) { const task = await repo.add({ title: String(i) }); await repo.toggleDone(task.id); }
  const done = await repo.listDone(); assert.equal(done.length, 50); assert.equal(done[0].title, '50'); assert.equal(done[49].title, '1');
});
