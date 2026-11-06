import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { Executor, Migration } from '../src/db/migrations';
import { MIGRATIONS, readVersion, runMigrations } from '../src/db/migrations';

/** Gerçek SQL çalıştırmayan, yalnızca çalıştırıcının kullandığı ifadeleri yorumlayan sahte yürütücü. */
function fakeExecutor(initialVersion: number | null) {
  let hasMeta = initialVersion !== null;
  let version = initialVersion ?? 0;
  let txSnapshot: { hasMeta: boolean; version: number } | null = null;
  const log: string[] = [];

  const ex: Executor = {
    async exec(sql, params) {
      if (sql === 'BEGIN') { txSnapshot = { hasMeta, version }; return; }
      if (sql === 'COMMIT') { txSnapshot = null; return; }
      if (sql === 'ROLLBACK') {
        if (txSnapshot) ({ hasMeta, version } = txSnapshot);
        txSnapshot = null;
        return;
      }
      if (sql.startsWith('INSERT INTO meta')) { version = Number(params?.[1]); return; }
      if (sql === 'FAIL') throw new Error('boom');
      log.push(sql);
      if (sql.includes('CREATE TABLE IF NOT EXISTS meta')) hasMeta = true;
    },
    async query(sql) {
      if (sql.includes('sqlite_master')) return (hasMeta ? [{ name: 'meta' }] : []) as never[];
      if (sql.includes('FROM meta')) return (hasMeta && version > 0 ? [{ value: String(version) }] : []) as never[];
      return [];
    }
  };
  return { ex, log, getVersion: () => version };
}

const three: Migration[] = [
  { version: 1, statements: ['CREATE TABLE IF NOT EXISTS meta (...)'] },
  { version: 2, statements: ['M2-a', 'M2-b'] },
  { version: 3, statements: ['M3'] }
];

test('migrasyon 1 yalnızca meta tablosunu oluşturur', () => {
  assert.equal(MIGRATIONS[0].version, 1);
  assert.equal(MIGRATIONS[0].statements.length, 1);
  assert.match(MIGRATIONS[0].statements[0], /CREATE TABLE IF NOT EXISTS meta/);
});

test('gerçek migrasyon listesi 1 ve 2 sürümlerinden oluşur', () => {
  assert.deepEqual(MIGRATIONS.map(m => m.version), [1, 2]);
  assert.match(MIGRATIONS[1].statements.join('\n'), /CREATE TABLE notes/);
});

test('boş veritabanı gerçek migrasyonlarla sürüm 2\'ye ulaşır', async () => {
  const { ex, getVersion } = fakeExecutor(null);
  const result = await runMigrations(ex);
  assert.deepEqual(result, { from: 0, to: 2, applied: [1, 2] });
  assert.equal(getVersion(), 2);
});

test('sürüm 1 veritabanında yalnızca migrasyon 2 uygulanır', async () => {
  const { ex, log, getVersion } = fakeExecutor(1);
  const result = await runMigrations(ex);
  assert.deepEqual(result, { from: 1, to: 2, applied: [2] });
  assert.deepEqual(log, MIGRATIONS[1].statements);
  assert.equal(getVersion(), 2);
});

test('boş veritabanında hepsi uygulanır', async () => {
  const { ex, log, getVersion } = fakeExecutor(null);
  const result = await runMigrations(ex, three);
  assert.deepEqual(result, { from: 0, to: 3, applied: [1, 2, 3] });
  assert.deepEqual(log, ['CREATE TABLE IF NOT EXISTS meta (...)', 'M2-a', 'M2-b', 'M3']);
  assert.equal(getVersion(), 3);
});

test('zaten güncel veritabanında hiçbiri uygulanmaz', async () => {
  const { ex, log } = fakeExecutor(3);
  const result = await runMigrations(ex, three);
  assert.deepEqual(result, { from: 3, to: 3, applied: [] });
  assert.deepEqual(log, []);
});

test('kısmen uygulanmışta kalanlar sırayla uygulanır', async () => {
  const { ex, log, getVersion } = fakeExecutor(1);
  const shuffled = [three[2], three[0], three[1]];
  const result = await runMigrations(ex, shuffled);
  assert.deepEqual(result, { from: 1, to: 3, applied: [2, 3] });
  assert.deepEqual(log, ['M2-a', 'M2-b', 'M3']);
  assert.equal(getVersion(), 3);
});

test('hata olursa sürüm artırılmaz', async () => {
  const { ex, getVersion } = fakeExecutor(1);
  const failing: Migration[] = [
    three[0],
    three[1],
    { version: 3, statements: ['M3-ok', 'FAIL'] }
  ];
  await assert.rejects(() => runMigrations(ex, failing), /boom/);
  assert.equal(getVersion(), 2);
  assert.equal(await readVersion(ex), 2);
});
