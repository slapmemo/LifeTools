import { test, expect } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';

const desktopSnippets = 'CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)';

test.each(['desktop-first', 'extension-first'])('snippet tablosu her iki sırada korunur: %s', async order => {
  const db = await createMemoryExecutor();
  if (order === 'desktop-first') await db.exec(desktopSnippets);
  await runMigrations(db);
  await db.exec("INSERT INTO snippets VALUES (1, '/a', 'Başlık', 'İçerik', 0, 1, 1)");
  if (order === 'extension-first') await db.exec(desktopSnippets);
  expect(await db.query('SELECT trigger FROM snippets')).toEqual([{ trigger: '/a' }]);
});
