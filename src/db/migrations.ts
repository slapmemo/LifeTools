import type { BatchOptions, SqlParam, SqlStatement } from './protocol';

/** Migrasyon çalıştırıcısına enjekte edilen yürütücü (tarayıcıdan bağımsız). */
export interface Executor {
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  batch(statements: SqlStatement[], opts?: BatchOptions): Promise<void>;
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
  { version: 3, statements: [`CREATE TABLE IF NOT EXISTS snippets (
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
  ] },
  { version: 5, statements: [`CREATE TABLE site_time (day TEXT NOT NULL, domain TEXT NOT NULL, seconds INTEGER NOT NULL, PRIMARY KEY(day, domain))`] },
  { version: 6, statements: [
    'CREATE TABLE sessions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL)',
    `CREATE TABLE session_tabs (
      id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, url TEXT NOT NULL, title TEXT, pinned INTEGER NOT NULL DEFAULT 0,
      group_title TEXT, group_color TEXT
    )`,
    'CREATE INDEX idx_session_tabs_session ON session_tabs(session_id, position)'
  ] },
  { version: 7, statements: [
    'CREATE TABLE tab_labels (url TEXT PRIMARY KEY, label TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    'CREATE TABLE tab_notes (url TEXT PRIMARY KEY, note TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
  ] },
  { version: 8, statements: [
    `CREATE TABLE watch_items (id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('film','dizi','video','diger')), status TEXT NOT NULL DEFAULT 'izlenecek' CHECK(status IN ('izlenecek','izleniyor','bitti')), url TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
    'CREATE INDEX idx_watch_status_updated ON watch_items(status, updated_at)'
  ] },
  { version: 9, statements: [
    'CREATE TABLE note_pages (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, text TEXT NOT NULL, saved_at INTEGER NOT NULL)',
    'CREATE TABLE note_images (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, data_url TEXT NOT NULL, width INTEGER, height INTEGER)'
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
