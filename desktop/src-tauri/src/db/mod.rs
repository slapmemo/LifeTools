use rusqlite::{params, Connection, OptionalExtension, Result};
use std::path::PathBuf;

mod dashboard;
mod snippets;
mod prefs;
mod clipboard;

pub use dashboard::*;
pub use snippets::*;
pub use prefs::*;
pub use clipboard::*;

#[cfg(test)]
mod tests;

pub const SCHEMA_VERSION_KEY: &str = "desktop_schema_version";
pub const MAX_TEXT_CHARS: usize = 10_000;
const PREVIEW_CHARS: usize = 300;

pub struct Migration {
    pub version: i64,
    pub statements: &'static [&'static str],
}

/// Sıralı migrasyonlar. Mevcutlar değiştirilmez; yenisi sona eklenir.
pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        statements: &["CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"],
    },
    Migration {
        version: 2,
        statements: &[
            "CREATE TABLE clipboard_items (
                id INTEGER PRIMARY KEY,
                text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0
            )",
            "CREATE INDEX idx_clipboard_pinned_created ON clipboard_items(pinned, created_at)",
        ],
    },
    Migration {
        version: 3,
        statements: &["CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"],
    },
    Migration {
        version: 4,
        statements: &[
            "CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
            "CREATE TABLE ambient_presets (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, config_json TEXT NOT NULL, updated_at INTEGER NOT NULL)",
        ],
    },
];

pub fn default_path() -> std::result::Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA").ok_or("APPDATA bulunamadı")?;
    let dir = PathBuf::from(base).join("LifeTools");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("lifetools.db"))
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

pub fn read_version(db: &Connection) -> Result<i64> {
    let has_meta: bool = db.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta')",
        [],
        |r| r.get(0),
    )?;
    if !has_meta {
        return Ok(0);
    }
    let v: Option<String> = db
        .query_row("SELECT value FROM meta WHERE key = ?1", [SCHEMA_VERSION_KEY], |r| r.get(0))
        .optional()?;
    Ok(v.and_then(|s| s.parse::<i64>().ok()).filter(|n| *n >= 0).unwrap_or(0))
}

/// Paylaşılan veritabanını açar: WAL, busy_timeout=5000, foreign_keys=ON.
pub fn open(path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

pub fn configure(conn: &Connection) -> Result<()> {
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(())
}

/// Eski masaüstü sürümleri eklentiyle aynı `schema_version` anahtarını kullanıyordu.
/// Yalnızca masaüstü tablosu (`clipboard_items`) varsa değeri `desktop_schema_version`
/// anahtarına taşır; eklentinin sürüm anahtarına dokunmaz.
pub fn upgrade_version_key(db: &mut Connection) -> Result<()> {
    let tx = db.transaction()?;
    let has_meta: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta')", [], |r| r.get(0))?;
    if has_meta {
        let desktop: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM meta WHERE key='desktop_schema_version')", [], |r| r.get(0))?;
        let clipboard: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='clipboard_items')", [], |r| r.get(0))?;
        if !desktop && clipboard {
            tx.execute("INSERT INTO meta(key,value) SELECT 'desktop_schema_version',value FROM meta WHERE key='schema_version'", [])?;
            tx.execute("DELETE FROM meta WHERE key='schema_version' AND EXISTS(SELECT 1 FROM meta WHERE key='desktop_schema_version')", [])?;
        }
    }
    tx.commit()
}

/// Uygulanan sürümleri döndürür. Her migrasyon kendi işleminde çalışır; hata olursa geri alınır.
pub fn migrate_with(db: &mut Connection, migrations: &[Migration]) -> Result<Vec<i64>> {
    upgrade_version_key(db)?;
    let mut ordered: Vec<&Migration> = migrations.iter().collect();
    ordered.sort_by_key(|m| m.version);
    let mut current = read_version(db)?;
    let mut applied = Vec::new();
    for m in ordered {
        if m.version <= current {
            continue;
        }
        let tx = db.transaction()?;
        for s in m.statements {
            tx.execute_batch(s)?;
        }
        tx.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SCHEMA_VERSION_KEY, m.version.to_string()],
        )?;
        tx.commit()?;
        current = m.version;
        applied.push(m.version);
    }
    Ok(applied)
}

pub fn migrate(db: &mut Connection) -> Result<Vec<i64>> {
    migrate_with(db, MIGRATIONS)
}

pub fn get_setting(db: &Connection, key: &str) -> Result<Option<String>> {
    db.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional()
}

pub fn set_setting(db: &Connection, key: &str, value: &str) -> Result<()> {
    db.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

