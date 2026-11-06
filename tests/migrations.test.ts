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
    async batch() { throw new Error("Not used"); },
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
  assert.deepEqual(MIGRATIONS.map(m => m.version), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(MIGRATIONS[1].statements.join('\n'), /CREATE TABLE notes/);
});

test('boş veritabanı gerçek migrasyonlarla sürüm 2\'ye ulaşır', async () => {
  const { ex, getVersion } = fakeExecutor(null);
  const result = await runMigrations(ex);
  assert.deepEqual(result, { from: 0, to: 8, applied: [1, 2, 3, 4, 5, 6, 7, 8] });
  assert.equal(getVersion(), 8);
});

test('sürüm 1 veritabanında yalnızca migrasyon 2 uygulanır', async () => {
  const { ex, log, getVersion } = fakeExecutor(1);
  const result = await runMigrations(ex);
  assert.deepEqual(result, { from: 1, to: 8, applied: [2, 3, 4, 5, 6, 7, 8] });
  assert.deepEqual(log, [...MIGRATIONS[1].statements, ...MIGRATIONS[2].statements, ...MIGRATIONS[3].statements, ...MIGRATIONS[4].statements, ...MIGRATIONS[5].statements, ...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]);
  assert.equal(getVersion(), 8);
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

test('version 2 database applies migrations 3 and 4', async () => { const {ex, log} = fakeExecutor(2); assert.deepEqual(await runMigrations(ex), {from: 2, to: 8, applied: [3, 4, 5, 6, 7, 8]}); assert.deepEqual(log, [...MIGRATIONS[2].statements, ...MIGRATIONS[3].statements, ...MIGRATIONS[4].statements, ...MIGRATIONS[5].statements, ...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]); });

test('s?r?m 3 yaln?zca migrasyon 4 uygular', async () => { const { ex, log } = fakeExecutor(3); assert.deepEqual(await runMigrations(ex), { from: 3, to: 8, applied: [4, 5, 6, 7, 8] }); assert.deepEqual(log, [...MIGRATIONS[3].statements, ...MIGRATIONS[4].statements, ...MIGRATIONS[5].statements, ...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]); });

test('s?r?m 4 yaln?zca migrasyon 5 uygular', async () => { const {ex, log} = fakeExecutor(4); assert.deepEqual(await runMigrations(ex), {from: 4, to: 8, applied: [5, 6, 7, 8]}); assert.deepEqual(log, [...MIGRATIONS[4].statements, ...MIGRATIONS[5].statements, ...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]); });

test('sürüm 5 veritabanında yalnızca migrasyon 6 uygulanır', async () => {
  const { ex, log, getVersion } = fakeExecutor(5);
  assert.deepEqual(await runMigrations(ex), { from: 5, to: 8, applied: [6, 7, 8] });
  assert.deepEqual(log, [...MIGRATIONS[5].statements, ...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]);
  assert.equal(getVersion(), 8);
});

test('migrasyon 6 oturum tablolarını oluşturur', () => {
  const sql = MIGRATIONS[5].statements.join('\n');
  assert.match(sql, /CREATE TABLE sessions/);
  assert.match(sql, /CREATE TABLE session_tabs/);
  assert.match(sql, /REFERENCES sessions\(id\) ON DELETE CASCADE/);
});

test('sürüm 6 yalnızca migrasyon 7 uygular', async () => { const { ex, log } = fakeExecutor(6); assert.deepEqual(await runMigrations(ex), { from: 6, to: 8, applied: [7, 8] }); assert.deepEqual(log, [...MIGRATIONS[6].statements, ...MIGRATIONS[7].statements]); });

test('sürüm 7 yalnızca migrasyon 8 uygular', async () => { const {ex,log}=fakeExecutor(7); assert.deepEqual(await runMigrations(ex), {from:7,to:8,applied:[8]}); assert.deepEqual(log,MIGRATIONS[7].statements); });
