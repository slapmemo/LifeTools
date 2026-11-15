//! Eklentiyle ortak `watch_items` tablosu (eklenti migrasyon 8). Zaman damgaları milisaniye;
//! kurallar eklentideki `src/modules/watchlist/repo.ts` ile aynı.
use rusqlite::{params, Connection, Result};
use serde::Serialize;
use super::{fold, notes::now_millis};

pub const WATCH_KINDS: [&str; 4] = ["film", "dizi", "video", "diger"];
pub const WATCH_STATUSES: [&str; 3] = ["izlenecek", "izleniyor", "bitti"];
const MAX_TITLE: usize = 300;
const MAX_NOTE: usize = 2000;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct WatchItem {
    pub id: i64,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub url: Option<String>,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct WatchCounts {
    pub all: i64,
    pub izlenecek: i64,
    pub izleniyor: i64,
    pub bitti: i64,
}

#[derive(Serialize, Debug)]
pub struct WatchPage {
    /// `watch_items` yoksa veriler hâlâ eklentinin tarayıcı depolamasındadır.
    pub available: bool,
    pub items: Vec<WatchItem>,
    pub counts: WatchCounts,
}

fn table_exists(db: &Connection) -> Result<bool> {
    db.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='watch_items')", [], |r| r.get(0))
}

fn check(kind: &str) -> std::result::Result<(), String> {
    if WATCH_KINDS.contains(&kind) { Ok(()) } else { Err("Geçersiz tür.".into()) }
}

fn clean_title(title: &str) -> std::result::Result<String, String> {
    let t = title.trim();
    if t.is_empty() || t.chars().count() > MAX_TITLE { return Err("Başlık 1–300 karakter olmalı.".into()); }
    Ok(t.to_string())
}

fn clean_url(url: Option<&str>) -> std::result::Result<Option<String>, String> {
    let Some(u) = url.map(str::trim).filter(|u| !u.is_empty()) else { return Ok(None) };
    let lower = u.to_ascii_lowercase();
    if !(lower.starts_with("http://") || lower.starts_with("https://")) { return Err("Bağlantı http:// veya https:// ile başlamalı.".into()); }
    Ok(Some(u.to_string()))
}

fn clean_note(note: Option<&str>) -> std::result::Result<Option<String>, String> {
    let Some(n) = note.map(str::trim).filter(|n| !n.is_empty()) else { return Ok(None) };
    if n.chars().count() > MAX_NOTE { return Err("Not en fazla 2000 karakter olmalı.".into()); }
    Ok(Some(n.to_string()))
}

fn row(r: &rusqlite::Row) -> Result<WatchItem> {
    Ok(WatchItem { id: r.get(0)?, title: r.get(1)?, kind: r.get(2)?, status: r.get(3)?, url: r.get(4)?, note: r.get(5)?, created_at: r.get(6)?, updated_at: r.get(7)? })
}

const COLS: &str = "id,title,kind,status,url,note,created_at,updated_at";

fn counts(db: &Connection) -> Result<WatchCounts> {
    let mut c = WatchCounts::default();
    let mut st = db.prepare("SELECT status, count(*) FROM watch_items GROUP BY status")?;
    for item in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (status, n) = item?;
        c.all += n;
        match status.as_str() { "izlenecek" => c.izlenecek = n, "izleniyor" => c.izleniyor = n, "bitti" => c.bitti = n, _ => {} }
    }
    Ok(c)
}

/// Son güncellenen önce. `status` / `kind` boşsa hepsi; arama başlık, not ve adreste Türkçe harfleri katlayarak yapılır.
pub fn list_watch(db: &Connection, status: &str, kind: &str, query: &str) -> Result<WatchPage> {
    if !table_exists(db)? { return Ok(WatchPage { available: false, items: vec![], counts: WatchCounts::default() }); }
    let q = fold(query.trim());
    let mut st = db.prepare(&format!(
        "SELECT {COLS} FROM watch_items WHERE (?1 = '' OR status = ?1) AND (?2 = '' OR kind = ?2) ORDER BY updated_at DESC, id DESC"
    ))?;
    let mut items = Vec::new();
    for item in st.query_map(params![status, kind], row)? {
        let it = item?;
        let hit = q.is_empty() || [Some(&it.title), it.note.as_ref(), it.url.as_ref()].into_iter().flatten().any(|s| fold(s).contains(&q));
        if hit { items.push(it); }
    }
    Ok(WatchPage { available: true, items, counts: counts(db)? })
}

pub fn add_watch(db: &Connection, title: &str, kind: &str, url: Option<&str>, note: Option<&str>) -> std::result::Result<i64, String> {
    if !table_exists(db).map_err(|e| e.to_string())? { return Err(NOT_MOVED_WATCH.into()); }
    check(kind)?;
    let now = now_millis();
    db.execute(
        "INSERT INTO watch_items(title,kind,url,note,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",
        params![clean_title(title)?, kind, clean_url(url)?, clean_note(note)?, now],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

pub fn update_watch(db: &Connection, id: i64, title: &str, kind: &str, url: Option<&str>, note: Option<&str>) -> std::result::Result<(), String> {
    check(kind)?;
    let n = db.execute(
        "UPDATE watch_items SET title=?1,kind=?2,url=?3,note=?4,updated_at=?5 WHERE id=?6",
        params![clean_title(title)?, kind, clean_url(url)?, clean_note(note)?, now_millis(), id],
    ).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Kayıt bulunamadı.".into()); }
    Ok(())
}

pub fn set_watch_status(db: &Connection, id: i64, status: &str) -> std::result::Result<(), String> {
    if !WATCH_STATUSES.contains(&status) { return Err("Geçersiz durum.".into()); }
    let n = db.execute("UPDATE watch_items SET status=?1,updated_at=?2 WHERE id=?3", params![status, now_millis(), id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Kayıt bulunamadı.".into()); }
    Ok(())
}

pub fn delete_watch(db: &Connection, id: i64) -> Result<()> {
    db.execute("DELETE FROM watch_items WHERE id=?1", [id])?;
    Ok(())
}

#[cfg(test)]
pub fn get_watch(db: &Connection, id: i64) -> Result<Option<WatchItem>> {
    use rusqlite::OptionalExtension;
    db.query_row(&format!("SELECT {COLS} FROM watch_items WHERE id=?1"), [id], row).optional()
}

pub const NOT_MOVED_WATCH: &str = "İzleme listesi henüz tarayıcıda. Eklentide Ayarlar → Depolama → \"Verileri masaüstüne taşı\" deyin.";
