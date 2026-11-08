use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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

#[derive(Serialize, Debug)]
pub struct DashboardTask { pub id: i64, pub title: String, pub due: String }
#[derive(Serialize, Debug)]
pub struct DashboardNote { pub id: i64, pub title: String, pub updated_at: i64 }
#[derive(Serialize, Debug)]
pub struct DashboardSite { pub domain: String, pub seconds: i64 }
#[derive(Serialize, Debug)]
pub struct DashboardClip { pub id: i64, pub preview: String }
#[derive(Serialize, Debug)]
pub struct DashboardSummary {
    pub tasks_available: bool, pub notes_available: bool, pub sites_available: bool,
    pub open_count: i64, pub overdue_count: i64, pub today_tasks: Vec<DashboardTask>,
    pub notes: Vec<DashboardNote>, pub sites: Vec<DashboardSite>, pub clipboard: Vec<DashboardClip>,
    pub batteries: Vec<crate::battery::DeviceBattery>, pub ambient_playing: bool, pub ambient_active_count: usize,
}

fn table_exists(db: &Connection, name: &str) -> Result<bool> {
    db.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)", [name], |r| r.get(0))
}

pub fn dashboard_summary(db: &Connection, today: &str) -> Result<DashboardSummary> {
    let mut out = DashboardSummary {
        tasks_available: table_exists(db, "tasks")?, notes_available: table_exists(db, "notes")?,
        sites_available: table_exists(db, "site_time")?, open_count: 0, overdue_count: 0,
        today_tasks: vec![], notes: vec![], sites: vec![], clipboard: vec![], batteries: vec![],
        ambient_playing: false, ambient_active_count: 0,
    };
    if out.tasks_available {
        out.open_count = db.query_row("SELECT count(*) FROM tasks WHERE done_at IS NULL", [], |r| r.get(0))?;
        out.overdue_count = db.query_row("SELECT count(*) FROM tasks WHERE done_at IS NULL AND due_date IS NOT NULL AND substr(due_date,1,10) < ?1", [today], |r| r.get(0))?;
        let mut st = db.prepare("SELECT id,title,due_date FROM tasks WHERE done_at IS NULL AND substr(due_date,1,10)=?1 ORDER BY due_date,id LIMIT 5")?;
        out.today_tasks = st.query_map([today], |r| Ok(DashboardTask { id:r.get(0)?, title:r.get(1)?, due:r.get(2)? }))?.collect::<Result<_>>()?;
    }
    if out.notes_available {
        let mut st = db.prepare("SELECT id,coalesce(nullif(trim(page_title),''),text),updated_at FROM notes ORDER BY updated_at DESC,id DESC LIMIT 5")?;
        out.notes = st.query_map([], |r| { let text: String = r.get(1)?; Ok(DashboardNote { id:r.get(0)?, title:text.lines().next().unwrap_or("").chars().take(100).collect(), updated_at:r.get(2)? }) })?.collect::<Result<_>>()?;
    }
    if out.sites_available {
        let mut st = db.prepare("SELECT domain,seconds FROM site_time WHERE day=?1 ORDER BY seconds DESC,domain LIMIT 5")?;
        out.sites = st.query_map([today], |r| Ok(DashboardSite { domain:r.get(0)?, seconds:r.get(1)? }))?.collect::<Result<_>>()?;
    }
    let mut st = db.prepare("SELECT id,text FROM clipboard_items ORDER BY id DESC LIMIT 3")?;
    out.clipboard = st.query_map([], |r| { let text: String = r.get(1)?; Ok(DashboardClip { id:r.get(0)?, preview:text.chars().take(100).collect() }) })?.collect::<Result<_>>()?;
    Ok(out)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Snippet {
    pub id: i64,
    pub trigger: String,
    pub title: String,
    pub body: String,
    pub use_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub fn normalize_trigger(trigger: &str) -> std::result::Result<String, String> {
    let mut chars = trigger.chars();
    if !matches!(chars.next(), Some('/' | ';')) {
        return Err("Tetikleyici / veya ; ile başlamalı.".into());
    }
    let suffix: Vec<char> = chars.collect();
    if suffix.is_empty() || suffix.len() > 31 || !suffix.iter().all(|c|
        c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | 'ç' | 'Ç' | 'ğ' | 'Ğ' | 'ı' | 'İ' | 'ö' | 'Ö' | 'ş' | 'Ş' | 'ü' | 'Ü')) {
        return Err("Tetikleyici 1–31 harf, rakam, _ veya - içermeli.".into());
    }
    Ok(trigger.to_lowercase())
}

fn snippet_err(e: rusqlite::Error) -> String {
    match &e {
        rusqlite::Error::SqliteFailure(f, _) if f.code == rusqlite::ErrorCode::ConstraintViolation => {
            "Bu tetikleyici zaten kullanılıyor.".into()
        }
        _ => e.to_string(),
    }
}

pub fn save_snippet(db: &Connection, id: Option<i64>, trigger: &str, title: &str, body: &str) -> std::result::Result<i64, String> {
    let trigger = normalize_trigger(trigger)?;
    let title = title.trim();
    if title.is_empty() || body.is_empty() { return Err("Başlık ve içerik gerekli.".into()); }
    if title.chars().count() > 80 { return Err("Başlık en fazla 80 karakter olmalı.".into()); }
    if body.chars().count() > MAX_TEXT_CHARS { return Err("İçerik en fazla 10 000 karakter olmalı.".into()); }
    let now = now_secs();
    if let Some(id) = id {
        let n = db.execute("UPDATE snippets SET trigger=?1,title=?2,body=?3,updated_at=?4 WHERE id=?5", params![trigger,title,body,now,id]).map_err(snippet_err)?;
        if n == 0 { return Err("Şablon bulunamadı.".into()); }
        Ok(id)
    } else {
        db.execute("INSERT INTO snippets(trigger,title,body,created_at,updated_at) VALUES(?1,?2,?3,?4,?4)", params![trigger,title,body,now]).map_err(snippet_err)?;
        Ok(db.last_insert_rowid())
    }
}

pub fn get_snippet_body(db: &Connection, id: i64) -> Result<Option<String>> {
    db.query_row("SELECT body FROM snippets WHERE id=?1", [id], |r| r.get(0)).optional()
}

pub fn bump_snippet_use(db: &Connection, id: i64) -> Result<()> {
    db.execute("UPDATE snippets SET use_count=use_count+1 WHERE id=?1", [id])?;
    Ok(())
}

// ---------- Ortam sesi ön ayarları ----------

#[derive(Serialize, Debug, Clone)]
pub struct AmbientPreset {
    pub id: i64,
    pub name: String,
    pub config_json: String,
    pub updated_at: i64,
}

pub fn list_presets(db: &Connection) -> Result<Vec<AmbientPreset>> {
    let mut st = db.prepare("SELECT id,name,config_json,updated_at FROM ambient_presets ORDER BY name COLLATE NOCASE")?;
    let rows = st.query_map([], |r| Ok(AmbientPreset { id: r.get(0)?, name: r.get(1)?, config_json: r.get(2)?, updated_at: r.get(3)? }))?;
    rows.collect()
}

/// Aynı adlı ön ayar varsa üzerine yazar.
pub fn save_preset(db: &Connection, name: &str, config_json: &str) -> std::result::Result<i64, String> {
    let name = crate::ambient::validate_name(name)?;
    let json = crate::ambient::sanitize_config(config_json)?;
    db.execute(
        "INSERT INTO ambient_presets(name,config_json,updated_at) VALUES(?1,?2,?3)
         ON CONFLICT(name) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at",
        params![name, json, now_secs()],
    ).map_err(|e| e.to_string())?;
    db.query_row("SELECT id FROM ambient_presets WHERE name=?1", [&name], |r| r.get(0)).map_err(|e| e.to_string())
}

pub fn delete_preset(db: &Connection, id: i64) -> Result<usize> {
    db.execute("DELETE FROM ambient_presets WHERE id=?1", [id])
}

// ---------- Tercihler ----------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Prefs {
    /// Pil %20 altına düşünce bildir.
    pub battery_notify: bool,
    /// Şablonu yalnızca panoya kopyala (Ctrl+V gönderme).
    pub copy_only: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { battery_notify: true, copy_only: false }
    }
}

pub fn load_prefs(db: &Connection) -> Result<Prefs> {
    Ok(get_setting(db, "prefs")?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}

pub fn save_prefs(db: &Connection, p: &Prefs) -> Result<()> {
    set_setting(db, "prefs", &serde_json::to_string(p).unwrap_or_default())
}

pub fn list_snippets(db: &Connection, query: &str) -> Result<Vec<Snippet>> {
    let mut stmt = db.prepare("SELECT id,trigger,title,body,use_count,created_at,updated_at FROM snippets ORDER BY use_count DESC,trigger")?;
    let rows = stmt.query_map([], |r| Ok(Snippet { id:r.get(0)?, trigger:r.get(1)?, title:r.get(2)?, body:r.get(3)?, use_count:r.get(4)?, created_at:r.get(5)?, updated_at:r.get(6)? }))?;
    let q = fold(query.trim());
    let mut out = Vec::new();
    for row in rows { let item = row?; if q.is_empty() || [&item.trigger, &item.title, &item.body].iter().any(|s| fold(s).contains(&q)) { out.push(item); } }
    Ok(out)
}

pub fn delete_snippet(db: &Connection, id: i64) -> Result<usize> {
    db.execute("DELETE FROM snippets WHERE id=?1", [id])
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
            'Ç' | 'ç' => vec!['c'], 'Ğ' | 'ğ' => vec!['g'], 'Ö' | 'ö' => vec!['o'], 'Ş' | 'ş' => vec!['s'], 'Ü' | 'ü' => vec!['u'],
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
    fn dashboard_handles_missing_extension_tables() {
        let d = db();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert!(!s.tasks_available && !s.notes_available && !s.sites_available);
        assert_eq!((s.open_count, s.overdue_count), (0, 0));
        assert!(s.today_tasks.is_empty() && s.notes.is_empty() && s.sites.is_empty());
    }

    #[test]
    fn dashboard_orders_and_limits_shared_data() {
        let d = db();
        d.execute_batch("CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,due_date TEXT,done_at INTEGER); CREATE TABLE notes(id INTEGER PRIMARY KEY,text TEXT,page_title TEXT,updated_at INTEGER); CREATE TABLE site_time(day TEXT,domain TEXT,seconds INTEGER);").unwrap();
        for i in 1..=7 {
            d.execute("INSERT INTO tasks VALUES(?1,?2,?3,NULL)", params![i, format!("task {i}"), if i == 1 { "2026-11-07" } else { "2026-11-08" }]).unwrap();
            d.execute("INSERT INTO notes VALUES(?1,?2,NULL,?1)", params![i, format!("note {i}\nbody")]).unwrap();
            d.execute("INSERT INTO site_time VALUES('2026-11-08',?1,?2)", params![format!("site{i}"), i]).unwrap();
            insert_clip(&d, &format!("clip {i}"), i, 100).unwrap();
        }
        d.execute("INSERT INTO tasks VALUES(8,'done','2026-11-07',1)", []).unwrap();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert_eq!((s.open_count, s.overdue_count, s.today_tasks.len()), (7, 1, 5));
        assert_eq!(s.today_tasks[0].id, 2);
        assert_eq!((s.notes.len(), s.notes[0].id, s.notes[0].title.as_str()), (5, 7, "note 7"));
        assert_eq!((s.sites.len(), s.sites[0].domain.as_str()), (5, "site7"));
        assert_eq!((s.clipboard.len(), s.clipboard[0].preview.as_str()), (3, "clip 7"));
    }

    #[test]
    fn snippets_crud_validation_and_search() {
        let d = db();
        assert_eq!(normalize_trigger("/İ").unwrap(), "/i\u{307}");
        assert!(normalize_trigger("abc").is_err());
        assert!(normalize_trigger("/").is_err());
        assert!(normalize_trigger(&format!("/{}", "a".repeat(32))).is_err());
        let id = save_snippet(&d, None, "/TEST", "İstanbul", "Merhaba").unwrap();
        assert!(save_snippet(&d, None, "/test", "x", "y").is_err());
        assert_eq!(list_snippets(&d, "istanbul").unwrap()[0].id, id);
        save_snippet(&d, Some(id), ";yeni", "Yeni", "İçerik").unwrap();
        assert_eq!(list_snippets(&d, "icerik").unwrap()[0].trigger, ";yeni");
        assert_eq!(delete_snippet(&d, id).unwrap(), 1);
        assert!(list_snippets(&d, "").unwrap().is_empty());
    }

    #[test]
    fn snippet_use_count_lowercase_and_unique_message() {
        let d = db();
        let a = save_snippet(&d, None, "/ÇAY", "Çay", "Demli").unwrap();
        let t: String = d.query_row("SELECT trigger FROM snippets WHERE id=?1", [a], |r| r.get(0)).unwrap();
        assert_eq!(t, "/çay");
        let b = save_snippet(&d, None, ";b", "B", "bb").unwrap();
        assert_eq!(save_snippet(&d, Some(b), "/ÇAY", "B", "bb").unwrap_err(), "Bu tetikleyici zaten kullanılıyor.");
        bump_snippet_use(&d, b).unwrap();
        bump_snippet_use(&d, b).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap()[0].id, b); // çok kullanılan önce
        assert_eq!(get_snippet_body(&d, a).unwrap().as_deref(), Some("Demli"));
        assert_eq!(get_snippet_body(&d, 999).unwrap(), None);
        assert_eq!(list_snippets(&d, "DEMLİ").unwrap().len(), 1);
        assert!(save_snippet(&d, None, "/x", "  ", "y").is_err());
        assert!(save_snippet(&d, Some(999), "/zz", "t", "y").is_err());
    }

    #[test]
    fn ambient_presets_crud_and_validation() {
        let d = db();
        let id = save_preset(&d, " Yağmur ", r#"{"master":0.6,"channels":{"rain":{"on":true,"vol":0.9}}}"#).unwrap();
        let again = save_preset(&d, "Yağmur", r#"{"master":0.3}"#).unwrap();
        assert_eq!(id, again);
        let l = list_presets(&d).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name, "Yağmur");
        assert!(l[0].config_json.contains("0.3"));
        assert!(save_preset(&d, "", "{}").is_err());
        assert!(save_preset(&d, "x", r#"{"master":5}"#).is_err());
        assert_eq!(list_presets(&d).unwrap().len(), 1);
        assert_eq!(delete_preset(&d, id).unwrap(), 1);
        assert!(list_presets(&d).unwrap().is_empty());
    }

    #[test]
    fn prefs_default_and_roundtrip() {
        let d = db();
        assert_eq!(load_prefs(&d).unwrap(), Prefs { battery_notify: true, copy_only: false });
        save_prefs(&d, &Prefs { battery_notify: false, copy_only: true }).unwrap();
        assert_eq!(load_prefs(&d).unwrap(), Prefs { battery_notify: false, copy_only: true });
    }

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let mut d = Connection::open_in_memory().unwrap();
        assert_eq!(read_version(&d).unwrap(), 0);
        assert_eq!(migrate(&mut d).unwrap(), vec![1, 2, 3, 4]);
        assert_eq!(read_version(&d).unwrap(), 4);
        assert!(migrate(&mut d).unwrap().is_empty());
        let v: String = d
            .query_row("SELECT value FROM meta WHERE key='desktop_schema_version'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "4");
    }

    #[test]
    fn upgrades_legacy_desktop_version_key() {
        let mut d = db();
        d.execute("UPDATE meta SET key='schema_version' WHERE key='desktop_schema_version'", []).unwrap();
        assert!(migrate(&mut d).unwrap().is_empty());
        assert_eq!(read_version(&d).unwrap(), 4);
        let old: i64 = d.query_row("SELECT COUNT(*) FROM meta WHERE key='schema_version'", [], |r| r.get(0)).unwrap();
        assert_eq!(old, 0);
    }

    #[test]
    fn existing_extension_snippets_are_preserved() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO snippets VALUES(1,'/a','a','b',0,1,1);").unwrap();
        migrate(&mut d).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
    }

    const EXT_SNIPPETS: &str = "CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";

    fn meta_value(d: &Connection, key: &str) -> Option<String> {
        d.query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get(0)).optional().unwrap()
    }

    #[test]
    fn legacy_upgrade_keeps_data_and_moves_version() {
        let mut d = db();
        insert_clip(&d, "eski", 1, 100).unwrap();
        d.execute("UPDATE meta SET key='schema_version' WHERE key='desktop_schema_version'", []).unwrap();
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("4"));
        assert_eq!(meta_value(&d, "schema_version"), None);
        assert_eq!(count(&d), 1);
        // İkinci çalıştırma değişiklik yapmaz.
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("4"));
    }

    #[test]
    fn upgrade_leaves_extension_version_alone_without_desktop_tables() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES('schema_version','8');").unwrap();
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("8"));
        assert_eq!(meta_value(&d, "desktop_schema_version"), None);
    }

    #[test]
    fn shared_db_desktop_first_then_extension() {
        let mut d = Connection::open_in_memory().unwrap();
        migrate(&mut d).unwrap();
        save_snippet(&d, None, "/a", "A", "içerik").unwrap();
        // Eklenti migrasyonları aynı dosyada: snippets IF NOT EXISTS, kendi sürüm anahtarı.
        d.execute_batch(EXT_SNIPPETS).unwrap();
        d.execute("INSERT INTO meta(key,value) VALUES('schema_version','8')", []).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
        assert!(migrate(&mut d).unwrap().is_empty());
        assert_eq!(read_version(&d).unwrap(), 4);
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("8"));
    }

    #[test]
    fn shared_db_extension_first_then_desktop() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); {EXT_SNIPPETS}; \
             INSERT INTO snippets VALUES(1,'/e','E','b',0,1,1); INSERT INTO meta VALUES('schema_version','3');"
        ))
        .unwrap();
        assert_eq!(migrate(&mut d).unwrap(), vec![1, 2, 3, 4]);
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("3"));
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("4"));
    }

    #[test]
    fn configure_sets_wal_busy_timeout_and_foreign_keys() {
        let path = std::env::temp_dir().join(format!("lifetools-test-{}-{}.db", std::process::id(), now_secs()));
        {
            let d = open(&path).unwrap();
            let mode: String = d.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
            let busy: i64 = d.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
            let fk: i64 = d.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
            assert_eq!((mode.as_str(), busy, fk), ("wal", 5000, 1));
        }
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
        }
    }

    #[test]
    fn failed_migration_rolls_back() {
        let mut d = db();
        let bad = [Migration {
            version: 99,
            statements: &["CREATE TABLE x (a INTEGER)", "THIS IS NOT SQL"],
        }];
        assert!(migrate_with(&mut d, &bad).is_err());
        assert_eq!(read_version(&d).unwrap(), 4);
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
