use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const SCHEMA_VERSION_KEY: &str = "schema_version";
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

/// Uygulanan sürümleri döndürür. Her migrasyon kendi işleminde çalışır; hata olursa geri alınır.
pub fn migrate_with(db: &mut Connection, migrations: &[Migration]) -> Result<Vec<i64>> {
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

// ---------- Ayarlar ----------

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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Settings {
    pub paused: bool,
    pub expire_days: i64,
    pub max_items: i64,
    pub exclusions: Vec<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            paused: false,
            expire_days: 7,
            max_items: 500,
            exclusions: ["KeePassXC.exe", "KeePass.exe", "1Password.exe", "Bitwarden.exe"]
                .iter()
                .map(|s| s.to_string())
                .collect(),
        }
    }
}

impl Settings {
    pub fn sanitized(mut self) -> Self {
        self.expire_days = self.expire_days.clamp(1, 365);
        self.max_items = self.max_items.clamp(10, 5000);
        let mut seen: Vec<String> = Vec::new();
        for e in self.exclusions.iter().map(|e| e.trim()).filter(|e| !e.is_empty()) {
            if !seen.iter().any(|s| s.eq_ignore_ascii_case(e)) {
                seen.push(e.to_string());
            }
        }
        self.exclusions = seen;
        self
    }
}

pub fn load_settings(db: &Connection) -> Result<Settings> {
    Ok(get_setting(db, "app_settings")?
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .map(Settings::sanitized)
        .unwrap_or_default())
}

pub fn save_settings(db: &Connection, s: Settings) -> Result<Settings> {
    let s = s.sanitized();
    let json = serde_json::to_string(&s).unwrap_or_default();
    set_setting(db, "app_settings", &json)?;
    Ok(s)
}

// ---------- Pano geçmişi ----------

#[derive(Serialize, Debug)]
pub struct ClipboardItem {
    pub id: i64,
    /// En fazla 300 karakterlik önizleme; tamamı `clipboard_copy` ile kopyalanır.
    pub text: String,
    pub truncated: bool,
    pub created_at: i64,
    pub pinned: bool,
}

/// Arama için Türkçe duyarsız indirgeme: İ/I/ı → i, diğerleri küçük harf.
pub fn fold(s: &str) -> String {
    s.chars()
        .flat_map(|c| match c {
            'İ' | 'I' | 'ı' => vec!['i'],
            c => c.to_lowercase().collect::<Vec<_>>(),
        })
        .collect()
}

/// Yeni öğe eklenirse true. Boş, çok uzun veya bir önceki ile aynı metin eklenmez.
pub fn insert_clip(db: &Connection, text: &str, now: i64, max_items: i64) -> Result<bool> {
    if text.trim().is_empty() || text.chars().count() > MAX_TEXT_CHARS {
        return Ok(false);
    }
    let latest: Option<String> = db
        .query_row("SELECT text FROM clipboard_items ORDER BY id DESC LIMIT 1", [], |r| r.get(0))
        .optional()?;
    if latest.as_deref() == Some(text) {
        return Ok(false);
    }
    db.execute(
        "INSERT INTO clipboard_items (text, created_at, pinned) VALUES (?1, ?2, 0)",
        params![text, now],
    )?;
    enforce_limit(db, max_items)?;
    Ok(true)
}

/// Sabitlenmemiş en yeni `max_items` öğe tutulur; sabitlenenler sınıra dahil değildir ve silinmez.
pub fn enforce_limit(db: &Connection, max_items: i64) -> Result<()> {
    db.execute(
        "DELETE FROM clipboard_items WHERE pinned = 0 AND id NOT IN
         (SELECT id FROM clipboard_items WHERE pinned = 0 ORDER BY id DESC LIMIT ?1)",
        [max_items.max(0)],
    )?;
    Ok(())
}

/// Sabitlenmemiş ve `cutoff` (unix sn) öncesindeki öğeleri siler. Silinen sayısını döndürür.
pub fn expire_before(db: &Connection, cutoff: i64) -> Result<usize> {
    db.execute("DELETE FROM clipboard_items WHERE pinned = 0 AND created_at < ?1", [cutoff])
}

pub fn expire_older_than_days(db: &Connection, now: i64, days: i64) -> Result<usize> {
    if days <= 0 {
        return Ok(0);
    }
    expire_before(db, now - days * 86_400)
}

pub fn list_clips(db: &Connection, query: &str) -> Result<Vec<ClipboardItem>> {
    let q = fold(query.trim());
    let mut st = db.prepare(
        "SELECT id, text, created_at, pinned FROM clipboard_items ORDER BY pinned DESC, id DESC",
    )?;
    let rows = st.query_map([], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?, r.get::<_, i64>(3)? != 0))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (id, text, created_at, pinned) = row?;
        if !q.is_empty() && !fold(&text).contains(&q) {
            continue;
        }
        let truncated = text.chars().count() > PREVIEW_CHARS;
        let preview: String = if truncated { text.chars().take(PREVIEW_CHARS).collect() } else { text };
        out.push(ClipboardItem { id, text: preview, truncated, created_at, pinned });
    }
    Ok(out)
}

pub fn get_clip_text(db: &Connection, id: i64) -> Result<Option<String>> {
    db.query_row("SELECT text FROM clipboard_items WHERE id = ?1", [id], |r| r.get(0)).optional()
}

pub fn set_pinned(db: &Connection, id: i64, pinned: bool) -> Result<()> {
    db.execute("UPDATE clipboard_items SET pinned = ?1 WHERE id = ?2", params![pinned as i64, id])?;
    Ok(())
}

pub fn delete_clip(db: &Connection, id: i64) -> Result<()> {
    db.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])?;
    Ok(())
}

/// Sabitlenmemiş tüm öğeleri siler.
pub fn clear_unpinned(db: &Connection) -> Result<usize> {
    db.execute("DELETE FROM clipboard_items WHERE pinned = 0", [])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> Connection {
        let mut d = Connection::open_in_memory().unwrap();
        migrate(&mut d).unwrap();
        d
    }

    fn count(d: &Connection) -> i64 {
        d.query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let mut d = Connection::open_in_memory().unwrap();
        assert_eq!(read_version(&d).unwrap(), 0);
        assert_eq!(migrate(&mut d).unwrap(), vec![1, 2, 3]);
        assert_eq!(read_version(&d).unwrap(), 3);
        assert!(migrate(&mut d).unwrap().is_empty());
        let v: String = d
            .query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "3");
    }

    #[test]
    fn failed_migration_rolls_back() {
        let mut d = db();
        let bad = [Migration {
            version: 99,
            statements: &["CREATE TABLE x (a INTEGER)", "THIS IS NOT SQL"],
        }];
        assert!(migrate_with(&mut d, &bad).is_err());
        assert_eq!(read_version(&d).unwrap(), 3);
        let n: i64 = d
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name='x'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn dedupes_only_consecutive_copies() {
        let d = db();
        assert!(insert_clip(&d, "a", 1, 100).unwrap());
        assert!(!insert_clip(&d, "a", 2, 100).unwrap());
        assert!(insert_clip(&d, "b", 3, 100).unwrap());
        assert!(insert_clip(&d, "a", 4, 100).unwrap());
        assert_eq!(count(&d), 3);
    }

    #[test]
    fn rejects_empty_and_oversized() {
        let d = db();
        assert!(!insert_clip(&d, "   ", 1, 100).unwrap());
        assert!(!insert_clip(&d, &"x".repeat(MAX_TEXT_CHARS + 1), 1, 100).unwrap());
        assert!(insert_clip(&d, &"x".repeat(MAX_TEXT_CHARS), 1, 100).unwrap());
    }

    #[test]
    fn max_count_keeps_newest_and_pinned() {
        let d = db();
        insert_clip(&d, "old-pinned", 1, 2).unwrap();
        let id = d.last_insert_rowid();
        set_pinned(&d, id, true).unwrap();
        for (i, t) in ["a", "b", "c", "d"].iter().enumerate() {
            insert_clip(&d, t, 10 + i as i64, 2).unwrap();
        }
        let texts: Vec<String> = list_clips(&d, "").unwrap().into_iter().map(|i| i.text).collect();
        assert_eq!(texts, vec!["old-pinned", "d", "c"]);
    }

    #[test]
    fn expire_removes_old_unpinned_only() {
        let d = db();
        insert_clip(&d, "pinned-old", 100, 100).unwrap();
        set_pinned(&d, d.last_insert_rowid(), true).unwrap();
        insert_clip(&d, "old", 200, 100).unwrap();
        let now = 10 * 86_400;
        insert_clip(&d, "fresh", now - 3600, 100).unwrap();
        assert_eq!(expire_older_than_days(&d, now, 7).unwrap(), 1);
        let texts: Vec<String> = list_clips(&d, "").unwrap().into_iter().map(|i| i.text).collect();
        assert_eq!(texts, vec!["pinned-old", "fresh"]);
        assert_eq!(expire_older_than_days(&d, now, 0).unwrap(), 0);
    }

    #[test]
    fn search_is_turkish_insensitive() {
        let d = db();
        insert_clip(&d, "İstanbul gezisi", 1, 100).unwrap();
        insert_clip(&d, "ısı ölçer", 2, 100).unwrap();
        insert_clip(&d, "başka", 3, 100).unwrap();
        assert_eq!(list_clips(&d, "istanbul").unwrap().len(), 1);
        assert_eq!(list_clips(&d, "ÖLÇER").unwrap().len(), 1);
        assert_eq!(list_clips(&d, "").unwrap().len(), 3);
        assert_eq!(list_clips(&d, "yok").unwrap().len(), 0);
    }

    #[test]
    fn preview_is_truncated_but_full_text_available() {
        let d = db();
        let long = "y".repeat(1000);
        insert_clip(&d, &long, 1, 100).unwrap();
        let items = list_clips(&d, "").unwrap();
        assert!(items[0].truncated);
        assert_eq!(items[0].text.chars().count(), PREVIEW_CHARS);
        assert_eq!(get_clip_text(&d, items[0].id).unwrap().unwrap(), long);
    }

    #[test]
    fn delete_and_clear_unpinned() {
        let d = db();
        insert_clip(&d, "keep", 1, 100).unwrap();
        set_pinned(&d, d.last_insert_rowid(), true).unwrap();
        insert_clip(&d, "x", 2, 100).unwrap();
        let x = d.last_insert_rowid();
        insert_clip(&d, "y", 3, 100).unwrap();
        delete_clip(&d, x).unwrap();
        assert_eq!(count(&d), 2);
        assert_eq!(clear_unpinned(&d).unwrap(), 1);
        assert_eq!(count(&d), 1);
    }

    #[test]
    fn settings_roundtrip_and_sanitize() {
        let d = db();
        assert_eq!(load_settings(&d).unwrap(), Settings::default());
        let saved = save_settings(
            &d,
            Settings {
                paused: true,
                expire_days: 9999,
                max_items: 1,
                exclusions: vec![" a.exe ".into(), "A.EXE".into(), "".into(), "b.exe".into()],
            },
        )
        .unwrap();
        assert_eq!(saved.expire_days, 365);
        assert_eq!(saved.max_items, 10);
        assert_eq!(saved.exclusions, vec!["a.exe", "b.exe"]);
        assert_eq!(load_settings(&d).unwrap(), saved);
    }
}
