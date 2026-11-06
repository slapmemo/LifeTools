import { expect, test } from 'vitest';
import { exportData } from '../src/core/backup';
import { runMigrations, type Executor } from '../src/db/migrations';
import { TargetNotEmptyError, countRows, transferData } from '../src/db/transfer';
import { createMemoryExecutor } from './sqlite-memory';

test('dolu hedef onaysız korunur; onaylı aktarım kaynağı değiştirmez', async () => {
  const source = await createMemoryExecutor();
  const target = await createMemoryExecutor();
  await runMigrations(source);
  await runMigrations(target);
  await source.exec("INSERT INTO snippets VALUES (1, '/a', 'A', 'B', 0, 1, 1)");
  await target.exec("INSERT INTO snippets VALUES (2, '/b', 'B', 'C', 0, 1, 1)");
  const before = (await exportData(source, {})).tables;
  await expect(transferData(source, target)).rejects.toThrow('üzerine yaz');
  expect(await target.query('SELECT id FROM snippets')).toEqual([{ id: 2 }]);
  await transferData(source, target, true);
  expect((await exportData(target, {})).tables).toEqual(before);
  expect((await exportData(source, {})).tables).toEqual(before);
});

test('boş hedefe aktarım: migrasyon çalışır, sayılar doğrulanıp döner, kaynak değişmez', async () => {
  const source = await createMemoryExecutor();
  const target = await createMemoryExecutor(); // migrasyonsuz boş DB
  await runMigrations(source);
  await source.exec("INSERT INTO notes VALUES (1,'note','çalışma',NULL,NULL,NULL,1,2)");
  await source.exec("INSERT INTO snippets VALUES (1,'/a','A','B',0,1,1)");
  await source.exec("INSERT INTO sessions VALUES (7,'Oturum',1)");
  await source.exec("INSERT INTO session_tabs VALUES (1,7,0,'https://a.com',NULL,0,NULL,NULL)");
  const before = await countRows(source);
  const counts = await transferData(source, target);
  expect(counts).toEqual(before);
  expect(counts).toMatchObject({ notes: 1, snippets: 1, sessions: 1, session_tabs: 1 });
  expect(await countRows(source)).toEqual(before);
  expect(await target.query("SELECT rowid FROM notes_fts WHERE notes_fts MATCH 'calisma'")).toHaveLength(1);
});

test('onaysız reddetme TargetNotEmptyError ile toplam sayıyı bildirir', async () => {
  const source = await createMemoryExecutor();
  const target = await createMemoryExecutor();
  await runMigrations(source);
  await runMigrations(target);
  await target.exec("INSERT INTO tasks VALUES (1,'g',NULL,NULL,NULL,NULL,1,1)");
  await target.exec("INSERT INTO tasks VALUES (2,'h',NULL,NULL,NULL,NULL,1,1)");
  const err = await transferData(source, target).catch(e => e);
  expect(err).toBeInstanceOf(TargetNotEmptyError);
  expect((err as TargetNotEmptyError).total).toBe(2);
});

test('hedefte satır sayısı tutmazsa doğrulama hata verir', async () => {
  const source = await createMemoryExecutor();
  const inner = await createMemoryExecutor();
  await runMigrations(source);
  await source.exec("INSERT INTO snippets VALUES (1,'/a','A','B',0,1,1)");
  const lossy: Executor = {
    exec: (sql, params) => inner.exec(sql, params),
    query: (sql, params) => inner.query(sql, params),
    async batch(statements) {
      await inner.batch(statements);
      await inner.exec('DELETE FROM snippets'); // kayıp simülasyonu
    }
  };
  await expect(transferData(source, lossy)).rejects.toThrow('Aktarım doğrulanamadı: snippets');
  expect(await countRows(source)).toMatchObject({ snippets: 1 });
});
