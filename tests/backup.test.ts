import { test, expect } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';
import { exportData, restoreData, validateBackup } from '../src/core/backup';

test('yedek Türkçe verilerle geri yüklenir ve FTS korunur', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  await ex.exec("INSERT INTO notes VALUES (1,'note','çalışma ışığı',NULL,NULL,NULL,1,2)");
  await ex.exec("INSERT INTO snippets VALUES (1,'/merhaba','Başlık','İçerik',2,1,2)");
  await ex.exec("INSERT INTO tasks VALUES (1,'Görev',NULL,NULL,NULL,NULL,1,2)");
  await ex.exec("INSERT INTO site_time VALUES ('2026-01-01','örnek.com',42)");
  const backup = await exportData(ex, { enabled: true });
  await ex.exec('DELETE FROM notes'); await ex.exec('DELETE FROM snippets'); await ex.exec('DELETE FROM tasks'); await ex.exec('DELETE FROM site_time');
  expect(await restoreData(ex, validateBackup(JSON.parse(JSON.stringify(backup))))).toEqual({ notes: 1, snippets: 1, tasks: 1, site_time: 1, sessions: 0, session_tabs: 0, tab_labels: 0, tab_notes: 0 });
  expect((await exportData(ex, backup.settings)).tables).toEqual(backup.tables);
  expect(await ex.query("SELECT rowid FROM notes_fts WHERE notes_fts MATCH 'calisma' ")).toHaveLength(1);
});

test('geçersiz ve yeni yedekler reddedilir; eski tablolar boş kabul edilir', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex); const data = await exportData(ex, {});
  for (const value of [null, { ...data, app: 'wrong' }, { ...data, format: 2 }, { ...data, tables: {} }]) expect(() => validateBackup(value)).toThrow();
  expect(() => validateBackup({ ...data, schema_version: 999 })).toThrow('Bu yedek daha yeni bir LifeTools sürümünden');
  expect(validateBackup({ ...data, schema_version: 2, tables: { notes: [] } }).tables.tasks).toEqual([]);
});

test('hatalı geri yükleme ve toplu işlem geri alınır', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  await ex.exec("INSERT INTO notes VALUES (1,'note','önce',NULL,NULL,NULL,1,1)");
  const data = await exportData(ex, {}); data.tables.notes[0].category = 'invalid';
  await expect(restoreData(ex, data)).rejects.toThrow();
  expect(await ex.query('SELECT text FROM notes')).toEqual([{ text: 'önce' }]);
  await expect(ex.batch([{ sql: 'DELETE FROM notes' }, { sql: 'INSERT INTO missing_table VALUES (1)' }])).rejects.toThrow();
  expect(await ex.query('SELECT text FROM notes')).toEqual([{ text: 'önce' }]);
});

test('yedek oturumları ve oturum sekmelerini içerir ve geri yükler', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  await ex.exec("INSERT INTO sessions VALUES (7,'İş oturumu',100)");
  await ex.exec("INSERT INTO session_tabs VALUES (1,7,0,'https://örnek.com/a','Başlık',1,NULL,NULL)");
  await ex.exec("INSERT INTO session_tabs VALUES (2,7,1,'https://example.com/b',NULL,0,'Araştırma','blue')");
  const backup = await exportData(ex, { zombieTabsHours: 12 });
  expect(backup.tables.sessions).toHaveLength(1);
  expect(backup.tables.session_tabs).toHaveLength(2);
  await ex.exec('DELETE FROM sessions');
  expect(await ex.query('SELECT * FROM session_tabs')).toEqual([]);
  expect(await restoreData(ex, validateBackup(JSON.parse(JSON.stringify(backup))))).toMatchObject({ sessions: 1, session_tabs: 2 });
  expect((await exportData(ex, backup.settings)).tables).toEqual(backup.tables);
  // Mevcut oturumların üzerine geri yükleme de çalışır (önce alt tablolar silinir).
  await restoreData(ex, backup);
  expect(await ex.query('SELECT COUNT(*) AS n FROM session_tabs')).toEqual([{ n: 2 }]);
});

test('sürüm 5 yedeğinde oturum tabloları boş kabul edilir', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  const data = await exportData(ex, {});
  const { sessions: _s, session_tabs: _t, ...old } = data.tables;
  const parsed = validateBackup({ ...data, schema_version: 5, tables: old });
  expect(parsed.tables.sessions).toEqual([]);
  expect(parsed.tables.session_tabs).toEqual([]);
});
