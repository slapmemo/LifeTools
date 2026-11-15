//! Eklentiyle ortak `notes` tablosu (eklenti migrasyon 2 + 9). Zaman damgaları eklentiyle aynı: milisaniye.
//!
//! Sabitleme / tamamlandı / arşiv / hatırlatma `note_meta` tablosundadır. `notes` eklentinin
//! migrasyonlarına ait olduğu için ona sütun eklenmez; `note_meta` iki tarafta da aynı
//! `CREATE TABLE IF NOT EXISTS` ile oluşturulur (eklenti migrasyon 11), hangisi önce gelirse.
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::Serialize;
use super::{fold, MAX_TEXT_CHARS};

pub const NOTE_CATEGORIES: [&str; 4] = ["note", "read", "watch", "idea"];
const LIST_LIMIT: i64 = 500;

/// Eklentideki migrasyon 11 ile birebir aynı olmalı.
pub const NOTE_META_DDL: [&str; 2] = [
    "CREATE TABLE IF NOT EXISTS note_meta (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, pinned INTEGER NOT NULL DEFAULT 0, done_at INTEGER, archived_at INTEGER, remind_at INTEGER, reminded_at INTEGER)",
    "CREATE INDEX IF NOT EXISTS idx_note_meta_remind ON note_meta(remind_at)",
];

#[derive(Serialize, Debug, Clone)]
pub struct Note {
    pub id: i64,
    pub category: String,
    pub text: String,
    pub url: Option<String>,
    pub page_title: Option<String>,
    pub user_note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub done_at: Option<i64>,
    pub archived_at: Option<i64>,
    pub remind_at: Option<i64>,
    pub has_page: bool,
    pub has_image: bool,
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct NoteCounts {
    pub all: i64,
    pub note: i64,
    pub read: i64,
    pub watch: i64,
    pub idea: i64,
    pub archived: i64,
}

#[derive(Serialize, Debug)]
pub struct NotesPage {
    /// `notes` tablosu yoksa veriler hâlâ eklentinin tarayıcı depolamasındadır.
    pub available: bool,
    pub notes: Vec<Note>,
    pub counts: NoteCounts,
}

#[derive(Serialize, Debug)]
pub struct NotePage {
    pub text: String,
    pub saved_at: i64,
}

/// Listeleme seçenekleri. `archived`: arşiv görünümü; `show_done`: tamamlananlar da gelsin.
pub struct ListOptions<'a> {
    pub category: &'a str,
    pub query: &'a str,
    pub archived: bool,
    pub show_done: bool,
    /// "new" (varsayılan), "old" veya "updated".
    pub sort: &'a str,
}

pub fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn table_exists(db: &Connection, name: &str) -> Result<bool> {
    db.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)", [name], |r| r.get(0))
}

fn notes_table_exists(db: &Connection) -> Result<bool> {
    table_exists(db, "notes")
}

/// `notes` varsa `note_meta`'yı oluşturur. `notes` yoksa false.
pub fn ensure_note_meta(db: &Connection) -> Result<bool> {
    if !notes_table_exists(db)? { return Ok(false); }
    for s in NOTE_META_DDL { db.execute_batch(s)?; }
    Ok(true)
}

fn check_category(category: &str) -> std::result::Result<(), String> {
    if NOTE_CATEGORIES.contains(&category) { Ok(()) } else { Err("Geçersiz kategori.".into()) }
}

fn clean_text(text: &str) -> std::result::Result<String, String> {
    let text = text.trim();
    if text.is_empty() { return Err("Not metni boş olamaz.".into()); }
    if text.chars().count() > MAX_TEXT_CHARS { return Err("Not en fazla 10 000 karakter olmalı.".into()); }
    Ok(text.to_string())
}

fn clean_optional(value: Option<&str>) -> Option<String> {
    value.map(str::trim).filter(|v| !v.is_empty()).map(str::to_string)
}

fn row(r: &rusqlite::Row) -> Result<Note> {
    Ok(Note {
        id: r.get(0)?, category: r.get(1)?, text: r.get(2)?, url: r.get(3)?, page_title: r.get(4)?,
        user_note: r.get(5)?, created_at: r.get(6)?, updated_at: r.get(7)?,
        pinned: r.get::<_, Option<i64>>(8)?.unwrap_or(0) != 0, done_at: r.get(9)?, archived_at: r.get(10)?,
        remind_at: r.get(11)?, has_page: r.get(12)?, has_image: r.get(13)?,
    })
}

/// `note_pages` / `note_images` eklenti migrasyon 9'da gelir; yoksa 0 döner.
fn select_sql(db: &Connection) -> Result<String> {
    let page = if table_exists(db, "note_pages")? { "EXISTS(SELECT 1 FROM note_pages p WHERE p.note_id=n.id)" } else { "0" };
    let image = if table_exists(db, "note_images")? { "EXISTS(SELECT 1 FROM note_images i WHERE i.note_id=n.id)" } else { "0" };
    Ok(format!(
        "SELECT n.id,n.category,n.text,n.url,n.page_title,n.user_note,n.created_at,n.updated_at,\
         m.pinned,m.done_at,m.archived_at,m.remind_at,{page},{image} \
         FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id"
    ))
}

fn matches(note: &Note, q: &str) -> bool {
    q.is_empty() || [Some(&note.text), note.user_note.as_ref(), note.page_title.as_ref(), note.url.as_ref()]
        .into_iter().flatten().any(|s| fold(s).contains(q))
}

fn counts(db: &Connection) -> Result<NoteCounts> {
    let mut c = NoteCounts::default();
    let mut st = db.prepare(
        "SELECT n.category, count(*) FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id \
         WHERE m.archived_at IS NULL GROUP BY n.category",
    )?;
    for item in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (cat, n) = item?;
        c.all += n;
        match cat.as_str() { "note" => c.note = n, "read" => c.read = n, "watch" => c.watch = n, "idea" => c.idea = n, _ => {} }
    }
    c.archived = db.query_row("SELECT count(*) FROM note_meta WHERE archived_at IS NOT NULL", [], |r| r.get(0))?;
    Ok(c)
}

/// Sabitlenenler önce (arşivde değil), sonra seçilen sıralama. Arama Türkçe harfleri katlayarak
/// metin, notum, başlık ve adreste yapılır; `#etiket` aramaları da böyle eşleşir.
pub fn list_notes(db: &Connection, o: &ListOptions) -> Result<NotesPage> {
    if !ensure_note_meta(db)? { return Ok(NotesPage { available: false, notes: vec![], counts: NoteCounts::default() }); }
    let q = fold(o.query.trim());
    let order = match o.sort { "old" => "n.created_at ASC, n.id ASC", "updated" => "n.updated_at DESC, n.id DESC", _ => "n.created_at DESC, n.id DESC" };
    let pin = if o.archived { "" } else { "coalesce(m.pinned,0) DESC, " };
    let sql = format!(
        "{} WHERE (?1 = '' OR n.category = ?1) AND (m.archived_at IS NOT NULL) = ?2 AND (?3 OR m.done_at IS NULL) ORDER BY {pin}{order}",
        select_sql(db)?
    );
    let mut stmt = db.prepare(&sql)?;
    let mut notes = Vec::new();
    for item in stmt.query_map(params![o.category, o.archived, o.show_done], row)? {
        let note = item?;
        if matches(&note, &q) { notes.push(note); }
        if notes.len() as i64 >= LIST_LIMIT { break; }
    }
    Ok(NotesPage { available: true, notes, counts: counts(db)? })
}

pub fn add_note(db: &Connection, category: &str, text: &str, url: Option<&str>, user_note: Option<&str>) -> std::result::Result<i64, String> {
    if !notes_table_exists(db).map_err(|e| e.to_string())? { return Err(NOT_MOVED.into()); }
    check_category(category)?;
    let text = clean_text(text)?;
    let now = now_millis();
    db.execute(
        "INSERT INTO notes(category,text,url,page_title,user_note,created_at,updated_at) VALUES(?1,?2,?3,NULL,?4,?5,?5)",
        params![category, text, clean_optional(url), clean_optional(user_note), now],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

pub fn update_note(db: &Connection, id: i64, category: &str, text: &str, user_note: Option<&str>) -> std::result::Result<(), String> {
    check_category(category)?;
    let text = clean_text(text)?;
    let n = db.execute(
        "UPDATE notes SET category=?1,text=?2,user_note=?3,updated_at=?4 WHERE id=?5",
        params![category, text, clean_optional(user_note), now_millis(), id],
    ).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    Ok(())
}

/// Yalnız metni değiştirir (ör. yapılacak kutucuğu işaretleme); kategori ve "notum" korunur.
pub fn update_note_text(db: &Connection, id: i64, text: &str) -> std::result::Result<(), String> {
    let text = clean_text(text)?;
    let n = db.execute("UPDATE notes SET text=?1,updated_at=?2 WHERE id=?3", params![text, now_millis(), id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    Ok(())
}

pub fn set_note_category(db: &Connection, id: i64, category: &str) -> std::result::Result<(), String> {
    check_category(category)?;
    let n = db.execute("UPDATE notes SET category=?1,updated_at=?2 WHERE id=?3", params![category, now_millis(), id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    Ok(())
}

/// `note_meta` satırını oluşturup tek alanı günceller. `field` yalnız sabit adlardan gelir.
fn set_meta(db: &Connection, id: i64, field: &str, value: Option<i64>, extra: &str) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let exists: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM notes WHERE id=?1)", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if !exists { return Err("Not bulunamadı.".into()); }
    db.execute("INSERT OR IGNORE INTO note_meta(note_id) VALUES(?1)", [id]).map_err(|e| e.to_string())?;
    db.execute(&format!("UPDATE note_meta SET {field}=?1{extra} WHERE note_id=?2"), params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_note_pinned(db: &Connection, id: i64, pinned: bool) -> std::result::Result<(), String> {
    set_meta(db, id, "pinned", Some(pinned as i64), "")
}

pub fn set_note_done(db: &Connection, id: i64, done: bool) -> std::result::Result<(), String> {
    set_meta(db, id, "done_at", done.then(now_millis), "")
}

pub fn set_note_archived(db: &Connection, id: i64, archived: bool) -> std::result::Result<(), String> {
    set_meta(db, id, "archived_at", archived.then(now_millis), "")
}

/// Hatırlatma zamanı (ms) ya da `None` ile kaldırma. Yeni zaman verilince yeniden bildirilir.
pub fn set_note_reminder(db: &Connection, id: i64, remind_at: Option<i64>) -> std::result::Result<(), String> {
    set_meta(db, id, "remind_at", remind_at, ", reminded_at=NULL")
}

/// Zamanı gelmiş, henüz bildirilmemiş hatırlatmaları döndürür ve bildirildi olarak işaretler.
pub fn take_due_reminders(db: &Connection, now: i64) -> Result<Vec<(i64, String)>> {
    if !table_exists(db, "note_meta")? || !notes_table_exists(db)? { return Ok(vec![]); }
    let due: Vec<(i64, String)> = {
        let mut st = db.prepare(
            "SELECT n.id, n.text FROM note_meta m JOIN notes n ON n.id=m.note_id \
             WHERE m.remind_at IS NOT NULL AND m.remind_at <= ?1 AND m.reminded_at IS NULL ORDER BY m.remind_at",
        )?;
        let rows = st.query_map([now], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.collect::<Result<_>>()?
    };
    for (id, _) in &due {
        db.execute("UPDATE note_meta SET reminded_at=?1 WHERE note_id=?2", params![now, id])?;
    }
    Ok(due)
}

pub fn note_image(db: &Connection, id: i64) -> Result<Option<String>> {
    if !table_exists(db, "note_images")? { return Ok(None); }
    db.query_row("SELECT data_url FROM note_images WHERE note_id=?1", [id], |r| r.get(0)).optional()
}

pub fn note_page(db: &Connection, id: i64) -> Result<Option<NotePage>> {
    if !table_exists(db, "note_pages")? { return Ok(None); }
    db.query_row("SELECT text, saved_at FROM note_pages WHERE note_id=?1", [id], |r| Ok(NotePage { text: r.get(0)?, saved_at: r.get(1)? })).optional()
}

/// Ek sayfa/görsel/meta satırları da tek işlemde silinir (eklentideki deleteNote ile aynı).
pub fn delete_note(db: &mut Connection, id: i64) -> Result<()> {
    let tx = db.transaction()?;
    for table in ["note_images", "note_pages", "note_meta"] {
        if table_exists(&tx, table)? { tx.execute(&format!("DELETE FROM {table} WHERE note_id=?1"), [id])?; }
    }
    tx.execute("DELETE FROM notes WHERE id=?1", [id])?;
    tx.commit()
}

#[cfg(test)]
pub fn get_note(db: &Connection, id: i64) -> Result<Option<Note>> {
    ensure_note_meta(db)?;
    db.query_row(&format!("{} WHERE n.id=?1", select_sql(db)?), [id], row).optional()
}

pub const NOT_MOVED: &str = "Notlar henüz tarayıcıda. Eklentide Ayarlar → Depolama → \"Verileri masaüstüne taşı\" deyin.";
