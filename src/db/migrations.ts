import type { SqlParam } from './protocol';

/** Migrasyon çalıştırıcısına enjekte edilen yürütücü (tarayıcıdan bağımsız). */
export interface Executor {
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

export interface Migration {
  version: number;
  /** Sırayla çalıştırılan SQL ifadeleri. */
  statements: string[];
}

/** Sıralı migrasyon listesi. Mevcut öğeler değiştirilmez; yenisi sona eklenir. */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)'
    ]
  },
  {
    version: 2,
    statements: [
      `CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        category TEXT NOT NULL CHECK(category IN ('note','read','watch','idea')),
        text TEXT NOT NULL,
        url TEXT,
        page_title TEXT,
        user_note TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      'CREATE INDEX idx_notes_category_created ON notes(category, created_at)',
      // Bağımsız (contentful) FTS5 tablosu; rowid = notes.id. Türkçe noktasız ı, SQL tarafında i'ye indirgenir
      // (unicode61 bunu yapmaz); sorgu tarafında aynısı repo.ts içinde yapılır.
      `CREATE VIRTUAL TABLE notes_fts USING fts5(text, user_note, page_title, tokenize = 'unicode61 remove_diacritics 2')`,
      `CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
        INSERT INTO notes_fts(rowid, text, user_note, page_title) VALUES (
          new.id,
          replace(replace(new.text, 'ı', 'i'), 'İ', 'I'),
          replace(replace(coalesce(new.user_note, ''), 'ı', 'i'), 'İ', 'I'),
          replace(replace(coalesce(new.page_title, ''), 'ı', 'i'), 'İ', 'I')
        );
      END`,
      `CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.id;
      END`,
      `CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
        DELETE FROM notes_fts WHERE rowid = old.id;
        INSERT INTO notes_fts(rowid, text, user_note, page_title) VALUES (
          new.id,
          replace(replace(new.text, 'ı', 'i'), 'İ', 'I'),
          replace(replace(coalesce(new.user_note, ''), 'ı', 'i'), 'İ', 'I'),
          replace(replace(coalesce(new.page_title, ''), 'ı', 'i'), 'İ', 'I')
        );
      END`
    ]
  },
  { version: 3, statements: [`CREATE TABLE snippets (
    id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
    body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`] },
  { version: 4, statements: [
    `CREATE TABLE tasks (
      id INTEGER PRIMARY KEY, title TEXT NOT NULL, note TEXT, url TEXT, due_date TEXT,
      done_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    'CREATE INDEX idx_tasks_done_due ON tasks(done_at, due_date)'
  ] }
];

export const SCHEMA_VERSION_KEY = 'schema_version';

export async function readVersion(ex: Executor): Promise<number> {
  const tables = await ex.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'"
  );
  if (tables.length === 0) return 0;
  const rows = await ex.query<{ value: string }>('SELECT value FROM meta WHERE key = ?', [SCHEMA_VERSION_KEY]);
  if (rows.length === 0) return 0;
  const parsed = Number(rows[0].value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: number[];
}

/**
 * Henüz uygulanmamış migrasyonları sırayla uygular.
 * Her migrasyon kendi işleminde (transaction) çalışır; hata olursa geri alınır,
 * sürüm artırılmaz ve hata yukarı fırlatılır.
 */
export async function runMigrations(
  ex: Executor,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<MigrationResult> {
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const from = await readVersion(ex);
  let current = from;
  const applied: number[] = [];

  for (const migration of ordered) {
    if (migration.version <= current) continue;
    await ex.exec('BEGIN');
    try {
      for (const statement of migration.statements) await ex.exec(statement);
      await ex.exec(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [SCHEMA_VERSION_KEY, String(migration.version)]
      );
      await ex.exec('COMMIT');
    } catch (err) {
      try { await ex.exec('ROLLBACK'); } catch { /* işlem zaten bitmiş olabilir */ }
      throw err;
    }
    current = migration.version;
    applied.push(migration.version);
  }

  return { from, to: current, applied };
}
