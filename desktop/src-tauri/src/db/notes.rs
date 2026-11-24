//! Eklentiyle ortak `notes` tablosu (eklenti migrasyon 2 + 9). Zaman damgaları eklentiyle aynı: milisaniye.
//!
//! Sabitleme / tamamlandı / arşiv / hatırlatma `note_meta` tablosundadır. `notes` eklentinin
//! migrasyonlarına ait olduğu için ona sütun eklenmez; `note_meta` iki tarafta da aynı
//! `CREATE TABLE IF NOT EXISTS` ile oluşturulur (eklenti migrasyon 11), hangisi önce gelirse.
//! Çöp kutusu / renk / elle sıra (`note_extra`), kullanıcı kategorileri (`note_categories`) ve düzenleme
//! geçmişi (`note_history`) de aynı yolla (eklenti migrasyon 13) oluşturulur.
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::Serialize;
use std::collections::BTreeMap;
use super::fold;

const LIST_LIMIT: i64 = 500;

/// Not metni üst sınırı (karakter); eklentiyle aynı. Pano ve şablonlar `MAX_TEXT_CHARS` ile 10 000 kalır.
pub const MAX_NOTE_CHARS: usize = 50_000;
/// Çöpteki not bu kadar gün sonra kalıcı silinir.
pub const TRASH_DAYS: i64 = 15;
/// Bu süreden (ms) sık gelen kayıtlar geçmişe ayrıca yazılmaz.
const HISTORY_MERGE_MS: i64 = 5 * 60_000;
const HISTORY_MAX_PER_NOTE: i64 = 30;
const HISTORY_MAX_AGE_MS: i64 = 60 * 86_400_000;
const DAY_MS: i64 = 86_400_000;
const MAX_CATEGORY_LABEL: usize = 40;
pub const DEFAULT_CATEGORY: &str = "note";
pub const NOTE_COLORS: [&str; 5] = ["yellow", "green", "blue", "pink", "purple"];

/// Eklentideki migrasyon 11 ile birebir aynı olmalı.
pub const NOTE_META_DDL: [&str; 2] = [
    "CREATE TABLE IF NOT EXISTS note_meta (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, pinned INTEGER NOT NULL DEFAULT 0, done_at INTEGER, archived_at INTEGER, remind_at INTEGER, reminded_at INTEGER)",
    "CREATE INDEX IF NOT EXISTS idx_note_meta_remind ON note_meta(remind_at)",
];

/// Eklentideki migrasyon 13 (`NOTE_EXTRA_DDL`, src/db/migrations.ts) ile birebir aynı olmalı.
/// İlk altısı tablo/dizin/tohum; son üçü `notes.category` üzerindeki sabit CHECK kısıtını gevşetir.
pub const NOTE_EXTRA_DDL: [&str; 9] = [
    "CREATE TABLE IF NOT EXISTS note_extra (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, deleted_at INTEGER, color TEXT, position INTEGER)",
    "CREATE INDEX IF NOT EXISTS idx_note_extra_deleted ON note_extra(deleted_at)",
    "CREATE TABLE IF NOT EXISTS note_categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT, position INTEGER NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)",
    "INSERT OR IGNORE INTO note_categories (id, label, color, position, builtin, created_at) SELECT id, label, NULL, position, 1, 0 FROM (SELECT 'note' AS id, 'Notlar' AS label, 0 AS position UNION ALL SELECT 'read', 'Okunacaklar', 1 UNION ALL SELECT 'watch', 'İzlenecekler', 2 UNION ALL SELECT 'idea', 'Fikirler', 3) WHERE NOT EXISTS (SELECT 1 FROM note_categories)",
    "CREATE TABLE IF NOT EXISTS note_history (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, text TEXT NOT NULL, saved_at INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_note_history_note ON note_history(note_id, saved_at)",
    "PRAGMA writable_schema=ON",
    "UPDATE sqlite_master SET sql = replace(sql, 'CHECK(category IN (''note'',''read'',''watch'',''idea''))', 'CHECK(length(category) > 0)') WHERE type = 'table' AND name = 'notes'",
    "PRAGMA writable_schema=RESET",
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
    /// Renk adı (`NOTE_COLORS`) ya da yok.
    pub color: Option<String>,
    /// Elle sıralama konumu (küçük önce).
    pub position: Option<i64>,
    /// Yalnız çöp listesinde dolu (ms).
    pub deleted_at: Option<i64>,
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct NoteCounts {
    pub all: i64,
    pub note: i64,
    pub read: i64,
    pub watch: i64,
    pub idea: i64,
    pub archived: i64,
    /// Çöpteki not sayısı.
    pub trash: i64,
    /// Kategori kimliğine göre sayı (kullanıcı kategorileri dahil; arşiv ve çöp hariç).
    pub by_category: BTreeMap<String, i64>,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct NoteCategory {
    pub id: String,
    pub label: String,
    pub color: Option<String>,
    pub position: i64,
    pub builtin: bool,
    pub created_at: i64,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct HistoryEntry {
    pub id: i64,
    pub note_id: i64,
    pub text: String,
    pub saved_at: i64,
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
    /// "new" (varsayılan), "old", "updated" veya "manual" (elle sıra; sabitlenenler yine önce).
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

/// `notes` varsa `note_meta` ve 0.10.0 tablolarını oluşturur. `notes` yoksa false.
pub fn ensure_note_meta(db: &Connection) -> Result<bool> {
    if !notes_table_exists(db)? { return Ok(false); }
    for s in NOTE_META_DDL { db.execute_batch(s)?; }
    ensure_note_extras(db)?;
    Ok(true)
}

/// Eklenti migrasyon 13'ün masaüstü karşılığı (eklenti henüz açılmamış olabilir). Tablolar IF NOT EXISTS;
/// tohum yalnız `note_categories` boşken eklenir; CHECK kısıtı yalnız eski biçimdeyse gevşetilir.
pub fn ensure_note_extras(db: &Connection) -> Result<()> {
    for s in &NOTE_EXTRA_DDL[..6] { db.execute_batch(s)?; }
    let sql: Option<String> = db.query_row("SELECT sql FROM sqlite_master WHERE type='table' AND name='notes'", [], |r| r.get(0)).optional()?;
    if sql.is_some_and(|s| s.contains("CHECK(category IN ('note','read','watch','idea'))")) {
        let tx = db.unchecked_transaction()?;
        for s in &NOTE_EXTRA_DDL[6..] { tx.execute_batch(s)?; }
        bump_schema_version_and_check(&tx)?;
        tx.commit()?;
    }
    Ok(())
}

/// writable_schema ile sqlite_master elle değişince şema çerezi artmaz; diğer açık bağlantılar eski şemayı
/// önbellekte tutar. Çerezi artırır ve `quick_check` "ok" vermezse hata döner (işlem geri alınır).
/// Eklentideki `bumpSchemaVersionAndCheck` ile aynı.
pub fn bump_schema_version_and_check(db: &Connection) -> Result<()> {
    let current: i64 = db.query_row("PRAGMA schema_version", [], |r| r.get(0))?;
    db.execute_batch(&format!("PRAGMA schema_version = {}", current + 1))?;
    let mut st = db.prepare("PRAGMA quick_check")?;
    let rows: Vec<String> = st.query_map([], |r| r.get(0))?.collect::<Result<_>>()?;
    if rows.len() != 1 || rows[0] != "ok" {
        return Err(rusqlite::Error::SqliteFailure(rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CORRUPT), Some(format!("Veritabanı bütünlük denetimi başarısız: {}", rows.join("; ")))));
    }
    Ok(())
}

fn check_category(db: &Connection, category: &str) -> std::result::Result<(), String> {
    if !ensure_note_meta(db).map_err(|e| e.to_string())? { return Err(NOT_MOVED.into()); }
    let ok: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM note_categories WHERE id=?1)", [category], |r| r.get(0)).map_err(|e| e.to_string())?;
    if ok { Ok(()) } else { Err("Geçersiz kategori.".into()) }
}

fn clean_text(text: &str) -> std::result::Result<String, String> {
    let text = text.trim();
    if text.is_empty() { return Err("Not metni boş olamaz.".into()); }
    if text.chars().count() > MAX_NOTE_CHARS { return Err("Not en fazla 50 000 karakter olmalı.".into()); }
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
        color: r.get(14)?, position: r.get(15)?, deleted_at: r.get(16)?,
    })
}

/// `note_pages` / `note_images` eklenti migrasyon 9'da gelir; yoksa 0 döner. `note_extra` `ensure_note_meta` ile vardır.
fn select_sql(db: &Connection) -> Result<String> {
    let page = if table_exists(db, "note_pages")? { "EXISTS(SELECT 1 FROM note_pages p WHERE p.note_id=n.id)" } else { "0" };
    let image = if table_exists(db, "note_images")? { "EXISTS(SELECT 1 FROM note_images i WHERE i.note_id=n.id)" } else { "0" };
    Ok(format!(
        "SELECT n.id,n.category,n.text,n.url,n.page_title,n.user_note,n.created_at,n.updated_at,\
         m.pinned,m.done_at,m.archived_at,m.remind_at,{page},{image},e.color,e.position,e.deleted_at \
         FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id LEFT JOIN note_extra e ON e.note_id=n.id"
    ))
}

fn matches(note: &Note, q: &str) -> bool {
    q.is_empty() || [Some(&note.text), note.user_note.as_ref(), note.page_title.as_ref(), note.url.as_ref()]
        .into_iter().flatten().any(|s| fold(s).contains(q))
}

fn counts(db: &Connection) -> Result<NoteCounts> {
    let mut c = NoteCounts::default();
    let mut st = db.prepare(
        "SELECT n.category, count(*) FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id LEFT JOIN note_extra e ON e.note_id=n.id \
         WHERE m.archived_at IS NULL AND e.deleted_at IS NULL GROUP BY n.category",
    )?;
    for item in st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (cat, n) = item?;
        c.all += n;
        match cat.as_str() { "note" => c.note = n, "read" => c.read = n, "watch" => c.watch = n, "idea" => c.idea = n, _ => {} }
        c.by_category.insert(cat, n);
    }
    c.archived = db.query_row(
        "SELECT count(*) FROM note_meta m LEFT JOIN note_extra e ON e.note_id=m.note_id WHERE m.archived_at IS NOT NULL AND e.deleted_at IS NULL", [], |r| r.get(0))?;
    c.trash = db.query_row("SELECT count(*) FROM note_extra WHERE deleted_at IS NOT NULL", [], |r| r.get(0))?;
    Ok(c)
}

/// Sabitlenenler önce (arşivde değil), sonra seçilen sıralama. Arama Türkçe harfleri katlayarak
/// metin, notum, başlık ve adreste yapılır; `#etiket` aramaları da böyle eşleşir. Çöptekiler hiç gelmez.
pub fn list_notes(db: &Connection, o: &ListOptions) -> Result<NotesPage> {
    if !ensure_note_meta(db)? { return Ok(NotesPage { available: false, notes: vec![], counts: NoteCounts::default() }); }
    let q = fold(o.query.trim());
    let order = match o.sort {
        "old" => "n.created_at ASC, n.id ASC",
        "updated" => "n.updated_at DESC, n.id DESC",
        "manual" => "e.position IS NULL, e.position ASC, n.created_at DESC, n.id DESC",
        _ => "n.created_at DESC, n.id DESC",
    };
    let pin = if o.archived { "" } else { "coalesce(m.pinned,0) DESC, " };
    let sql = format!(
        "{} WHERE e.deleted_at IS NULL AND (?1 = '' OR n.category = ?1) AND (m.archived_at IS NOT NULL) = ?2 AND (?3 OR m.done_at IS NULL) ORDER BY {pin}{order}",
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
    check_category(db, category)?;
    let text = clean_text(text)?;
    let now = now_millis();
    db.execute(
        "INSERT INTO notes(category,text,url,page_title,user_note,created_at,updated_at) VALUES(?1,?2,?3,NULL,?4,?5,?5)",
        params![category, text, clean_optional(url), clean_optional(user_note), now],
    ).map_err(|e| e.to_string())?;
    Ok(db.last_insert_rowid())
}

/// Önceki metni geçmişe yazar: son kayıt 5 dakikadan yeniyse atlanır (`force`: geri yüklemede her zaman),
/// not başına en çok 30 kayıt, 60 günden eskiler silinir. Metin değişmiyorsa hiçbir şey yazmaz.
pub fn record_history(db: &Connection, id: i64, next_text: Option<&str>, force: bool, now: i64) -> std::result::Result<(), String> {
    let e = |e: rusqlite::Error| e.to_string();
    let current: Option<String> = db.query_row("SELECT text FROM notes WHERE id=?1", [id], |r| r.get(0)).optional().map_err(e)?;
    let Some(current) = current else { return Ok(()) };
    if next_text == Some(current.as_str()) { return Ok(()); }
    if !force {
        let last: Option<i64> = db.query_row("SELECT saved_at FROM note_history WHERE note_id=?1 ORDER BY saved_at DESC, id DESC LIMIT 1", [id], |r| r.get(0)).optional().map_err(e)?;
        if last.is_some_and(|t| now - t < HISTORY_MERGE_MS) { return Ok(()); }
    }
    db.execute("INSERT INTO note_history(note_id,text,saved_at) VALUES(?1,?2,?3)", params![id, current, now]).map_err(e)?;
    db.execute(
        "DELETE FROM note_history WHERE note_id=?1 AND id NOT IN (SELECT id FROM note_history WHERE note_id=?1 ORDER BY saved_at DESC, id DESC LIMIT ?2)",
        params![id, HISTORY_MAX_PER_NOTE],
    ).map_err(e)?;
    db.execute("DELETE FROM note_history WHERE saved_at < ?1", [now - HISTORY_MAX_AGE_MS]).map_err(e)?;
    Ok(())
}

pub fn update_note(db: &Connection, id: i64, category: &str, text: &str, user_note: Option<&str>) -> std::result::Result<(), String> {
    check_category(db, category)?;
    let text = clean_text(text)?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let now = now_millis();
    record_history(&tx, id, Some(&text), false, now)?;
    let n = tx.execute(
        "UPDATE notes SET category=?1,text=?2,user_note=?3,updated_at=?4 WHERE id=?5",
        params![category, text, clean_optional(user_note), now, id],
    ).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    tx.commit().map_err(|e| e.to_string())
}

/// Yalnız metni değiştirir (ör. yapılacak kutucuğu işaretleme); kategori ve "notum" korunur.
#[cfg(test)]
pub fn update_note_text(db: &Connection, id: i64, text: &str) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let text = clean_text(text)?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let now = now_millis();
    record_history(&tx, id, Some(&text), false, now)?;
    let n = tx.execute("UPDATE notes SET text=?1,updated_at=?2 WHERE id=?3", params![text, now, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    tx.commit().map_err(|e| e.to_string())
}

/// Beklenen `updated_at` tutmazsa dönen hata (arayüz bunu `NoteConflictError`'a çevirir).
pub const NOTE_CONFLICT: &str = "NOT_CONFLICT";

/// Metni değiştirir; `expected` verilmişse ve notun `updated_at` değeri farklıysa (başka yerde değişmiş)
/// hiçbir şey yazmadan `NOTE_CONFLICT` döner. Başarıda yeni `updated_at` değerini verir.
pub fn update_note_text_checked(db: &Connection, id: i64, text: &str, expected: Option<i64>) -> std::result::Result<i64, String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let text = clean_text(text)?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let current: Option<i64> = tx.query_row("SELECT updated_at FROM notes WHERE id=?1", [id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    let Some(current) = current else { return Err("Not bulunamadı.".into()) };
    if expected.is_some_and(|e| e != current) { return Err(NOTE_CONFLICT.into()); }
    // Aynı milisaniyede ikinci kayıt aynı değeri üretmesin: updated_at hep ilerler.
    let now = now_millis().max(current + 1);
    record_history(&tx, id, Some(&text), false, now)?;
    tx.execute("UPDATE notes SET text=?1,updated_at=?2 WHERE id=?3", params![text, now, id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(now)
}

/// Yalnız "notum" alanını değiştirir (metne dokunmaz).
pub fn set_note_user_note(db: &Connection, id: i64, user_note: Option<&str>) -> std::result::Result<(), String> {
    let n = db.execute("UPDATE notes SET user_note=?1,updated_at=?2 WHERE id=?3", params![clean_optional(user_note), now_millis(), id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not bulunamadı.".into()); }
    Ok(())
}

/// Notu çoğaltır: metin, kategori, bağlantı, "notum" ve renk kopyalanır (görsel, sayfa, hatırlatma, sabit değil).
/// İlk satırın sonuna " (kopya)" eklenir. Yeni notun kimliğini döndürür.
pub fn duplicate_note(db: &Connection, id: i64) -> std::result::Result<i64, String> {
    let n = get_note(db, id).map_err(|e| e.to_string())?.ok_or_else(|| "Not bulunamadı.".to_string())?;
    let (first, rest) = match n.text.split_once('\n') { Some((a, b)) => (a, Some(b)), None => (n.text.as_str(), None) };
    let text = match rest { Some(r) => format!("{first} (kopya)\n{r}"), None => format!("{first} (kopya)") };
    let new_id = add_note(db, &n.category, &text, n.url.as_deref(), n.user_note.as_deref())?;
    if let Some(c) = n.color.as_deref() { set_note_color(db, new_id, Some(c))?; }
    Ok(new_id)
}

pub fn set_note_category(db: &Connection, id: i64, category: &str) -> std::result::Result<(), String> {
    check_category(db, category)?;
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

/// `note_extra` satırını oluşturup tek alanı yazar (not yoksa hata). `field` yalnız sabit adlardan gelir.
fn set_extra(db: &Connection, id: i64, field: &str, value: rusqlite::types::Value) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let exists: bool = db.query_row("SELECT EXISTS(SELECT 1 FROM notes WHERE id=?1)", [id], |r| r.get(0)).map_err(|e| e.to_string())?;
    if !exists { return Err("Not bulunamadı.".into()); }
    db.execute("INSERT OR IGNORE INTO note_extra(note_id) VALUES(?1)", [id]).map_err(|e| e.to_string())?;
    db.execute(&format!("UPDATE note_extra SET {field}=?1 WHERE note_id=?2"), params![value, id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_note_color(db: &Connection, id: i64, color: Option<&str>) -> std::result::Result<(), String> {
    if let Some(c) = color { if !NOTE_COLORS.contains(&c) { return Err("Geçersiz renk.".into()); } }
    set_extra(db, id, "color", color.map(str::to_string).into())
}

pub fn set_note_position(db: &Connection, id: i64, position: i64) -> std::result::Result<(), String> {
    set_extra(db, id, "position", position.into())
}

/// Verilen sırayı konum olarak yazar (0, 1, 2 …); tek işlemde. Bilinmeyen kimlikler atlanır.
/// Elle sıralama: `ids` ekranda görünen satırların yeni sırasıdır (gizli satırlar olabilir).
/// Kapsam = aynı kategori filtresi (`category`; None: hepsi) + `ids[0]` ile aynı sabit grubu, silinmemiş ve arşivlenmemiş notlar.
/// Kapsamın TAM elle sırası okunur, verilen kimliklerin kapladığı yuvalara yeni sırayla yerleştirilir ve kapsam 0..n yeniden numaralanır;
/// böylece yalnız görünen satırlar gelse de konumlar çakışmaz. Konumsuz notlar konumlulardan sonra, created_at azalan gelir.
pub fn reorder_notes_scoped(db: &Connection, ids: &[i64], category: Option<&str>) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let e = |e: rusqlite::Error| e.to_string();
    let Some(&first) = ids.first() else { return Ok(()) };
    let tx = db.unchecked_transaction().map_err(e)?;
    let group: bool = tx.query_row("SELECT coalesce(m.pinned,0) FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id WHERE n.id=?1", [first], |r| r.get(0)).optional().map_err(e)?
        .ok_or_else(|| "Not bulunamadı.".to_string())?;
    let mut full: Vec<i64> = {
        let mut st = tx.prepare(
            "SELECT n.id FROM notes n LEFT JOIN note_meta m ON m.note_id=n.id LEFT JOIN note_extra x ON x.note_id=n.id \
             WHERE x.deleted_at IS NULL AND m.archived_at IS NULL AND (?1 IS NULL OR n.category=?1) AND (coalesce(m.pinned,0)<>0)=?2 \
             ORDER BY x.position IS NULL, x.position ASC, n.created_at DESC, n.id DESC",
        ).map_err(e)?;
        let rows = st.query_map(params![category, group], |r| r.get::<_, i64>(0)).map_err(e)?;
        rows.collect::<Result<Vec<_>>>().map_err(e)?
    };
    // Kapsamda olmayan ve tekrar eden kimlikler yok sayılır.
    let mut seen = std::collections::HashSet::new();
    let given: Vec<i64> = ids.iter().copied().filter(|id| full.contains(id) && seen.insert(*id)).collect();
    let slots: Vec<usize> = full.iter().enumerate().filter(|(_, id)| seen.contains(id)).map(|(i, _)| i).collect();
    for (slot, id) in slots.iter().zip(given.iter()) { full[*slot] = *id; }
    for (i, id) in full.iter().enumerate() {
        tx.execute("INSERT OR IGNORE INTO note_extra(note_id) VALUES(?1)", [id]).map_err(e)?;
        tx.execute("UPDATE note_extra SET position=?1 WHERE note_id=?2", params![i as i64, id]).map_err(e)?;
    }
    tx.commit().map_err(e)
}

/// Kategori silinince "Notlar"a taşınacak not sayısı (arşivdekiler dahil; çöptekiler de taşınır).
pub fn category_note_count(db: &Connection, id: &str) -> std::result::Result<i64, String> {
    db.query_row("SELECT count(*) FROM notes WHERE category=?1", [id], |r| r.get(0)).map_err(|e| e.to_string())
}


/// Zamanı gelmiş, henüz bildirilmemiş hatırlatmaları döndürür ve bildirildi olarak işaretler. Çöptekiler çalmaz.
pub fn take_due_reminders(db: &Connection, now: i64) -> Result<Vec<(i64, String)>> {
    if !table_exists(db, "note_meta")? || !notes_table_exists(db)? { return Ok(vec![]); }
    ensure_note_meta(db)?;
    let due: Vec<(i64, String)> = {
        let mut st = db.prepare(
            "SELECT n.id, n.text FROM note_meta m JOIN notes n ON n.id=m.note_id \
             WHERE m.remind_at IS NOT NULL AND m.remind_at <= ?1 AND m.reminded_at IS NULL \
             AND NOT EXISTS (SELECT 1 FROM note_extra x WHERE x.note_id=n.id AND x.deleted_at IS NOT NULL) ORDER BY m.remind_at",
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

/// Çöpe taşır (yumuşak silme): `deleted_at` yazılır, hiçbir şey silinmez. Eklentideki `deleteNote` ile aynı.
pub fn delete_note(db: &Connection, id: i64) -> std::result::Result<(), String> {
    set_extra(db, id, "deleted_at", now_millis().into())
}

/// Kalıcı siler: görsel, sayfa kopyası, meta, ek bilgi ve geçmiş dahil, tek işlemde.
pub fn purge_note(db: &Connection, id: i64) -> Result<()> {
    let tx = db.unchecked_transaction()?;
    for table in ["note_images", "note_pages", "note_meta", "note_history", "note_extra"] {
        if table_exists(&tx, table)? { tx.execute(&format!("DELETE FROM {table} WHERE note_id=?1"), [id])?; }
    }
    tx.execute("DELETE FROM notes WHERE id=?1", [id])?;
    tx.commit()
}

pub fn list_trash(db: &Connection) -> Result<Vec<Note>> {
    if !ensure_note_meta(db)? { return Ok(vec![]); }
    let sql = format!("{} WHERE e.deleted_at IS NOT NULL ORDER BY e.deleted_at DESC, n.id DESC", select_sql(db)?);
    let mut stmt = db.prepare(&sql)?;
    let rows = stmt.query_map([], row)?;
    rows.collect()
}

pub fn restore_note(db: &Connection, id: i64) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let n = db.execute("UPDATE note_extra SET deleted_at=NULL WHERE note_id=?1", [id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Not çöpte değil.".into()); }
    Ok(())
}

const PURGE_TABLES: [&str; 4] = ["note_images", "note_pages", "note_meta", "note_history"];

/// `where_sql`: note_extra üzerinde seçim koşulu (çöpteki / süresi dolmuş). Silinen not sayısını döndürür.
fn purge_where(db: &Connection, where_sql: &str, p: &[&dyn rusqlite::ToSql]) -> Result<i64> {
    let ids = format!("SELECT note_id FROM note_extra WHERE {where_sql}");
    let tx = db.unchecked_transaction()?;
    for table in PURGE_TABLES {
        if table_exists(&tx, table)? { tx.execute(&format!("DELETE FROM {table} WHERE note_id IN ({ids})"), p)?; }
    }
    // note_extra en sonda: `notes` silinince ON DELETE CASCADE ile gider (alt sorgu o zamana kadar geçerli).
    let n = tx.execute(&format!("DELETE FROM notes WHERE id IN ({ids})"), p)? as i64;
    tx.commit()?;
    Ok(n)
}

/// Çöpü boşaltır; silinen not sayısını döndürür.
pub fn empty_trash(db: &Connection) -> Result<i64> {
    if !ensure_note_meta(db)? { return Ok(0); }
    purge_where(db, "deleted_at IS NOT NULL", &[])
}

/// `days` günden uzun süredir çöpte olanları kalıcı siler; 60 günden eski geçmişi de temizler.
pub fn purge_expired(db: &Connection, now: i64, days: i64) -> Result<i64> {
    if !ensure_note_meta(db)? { return Ok(0); }
    let n = purge_where(db, "deleted_at IS NOT NULL AND deleted_at <= ?1", &[&(now - days * DAY_MS)])?;
    db.execute("DELETE FROM note_history WHERE saved_at < ?1", [now - HISTORY_MAX_AGE_MS])?;
    Ok(n)
}

pub fn list_history(db: &Connection, id: i64) -> Result<Vec<HistoryEntry>> {
    if !ensure_note_meta(db)? { return Ok(vec![]); }
    let mut st = db.prepare("SELECT id,note_id,text,saved_at FROM note_history WHERE note_id=?1 ORDER BY saved_at DESC, id DESC")?;
    let rows = st.query_map([id], |r| Ok(HistoryEntry { id: r.get(0)?, note_id: r.get(1)?, text: r.get(2)?, saved_at: r.get(3)? }))?;
    rows.collect()
}

/// Geçmişteki metne döner; o anki metin önce geçmişe yazılır.
pub fn restore_history(db: &Connection, history_id: i64) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let found: Option<(i64, String)> = db.query_row("SELECT note_id,text FROM note_history WHERE id=?1", [history_id], |r| Ok((r.get(0)?, r.get(1)?))).optional().map_err(|e| e.to_string())?;
    let (note_id, text) = found.ok_or("Geçmiş kaydı bulunamadı.")?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let now = now_millis();
    record_history(&tx, note_id, Some(&text), true, now)?;
    tx.execute("UPDATE notes SET text=?1,updated_at=?2 WHERE id=?3", params![text, now, note_id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

fn category_row(r: &rusqlite::Row) -> Result<NoteCategory> {
    Ok(NoteCategory { id: r.get(0)?, label: r.get(1)?, color: r.get(2)?, position: r.get(3)?, builtin: r.get::<_, i64>(4)? != 0, created_at: r.get(5)? })
}

pub fn list_categories(db: &Connection) -> Result<Vec<NoteCategory>> {
    if !ensure_note_meta(db)? { return Ok(vec![]); }
    let mut st = db.prepare("SELECT id,label,color,position,builtin,created_at FROM note_categories ORDER BY position, created_at, id")?;
    let rows = st.query_map([], category_row)?;
    rows.collect()
}

/// Etiketten güvenli kimlik üretir (Türkçe harfler ASCII'ye katlanır); eklentideki `slugifyCategoryId` ile aynı.
const SLUG_TABLE: &str = "a:àáâãäåāăą,c:çćčĉċ,d:ďđ,e:èéêëēĕėęě,g:ğĝġģ,h:ĥħ,i:ìíîïĩīĭįı,j:ĵ,k:ķ,l:ĺļľŀł,n:ñńņňŉ,o:òóôõöøōŏő,r:ŕŗř,s:śŝşš,t:ţťŧ,u:ùúûüũūŭůűų,w:ŵ,y:ýÿŷ,z:źżž,ss:ß,ae:æ,oe:œ";

/// Kategori kimliği: küçük harf, aksanlar ASCII'ye (tablo), diğer her şey "-", en çok 24 karakter.
/// Eklentideki `slugifyCategoryId` ile aynı tablo ve kurallar (ortak test: tests/fixtures/category-slugs.json).
pub fn slugify_category_id(label: &str) -> String {
    let mut out = String::new();
    for original in label.chars() {
        let lowered: Vec<char> = if matches!(original, 'İ' | 'I') { vec!['i'] } else { original.to_lowercase().collect() };
        for c in lowered {
            let mapped = SLUG_TABLE.split(',').find_map(|g| { let (ascii, chars) = g.split_once(':')?; chars.contains(c).then_some(ascii) });
            match mapped { Some(a) => out.push_str(a), None => out.push(c) }
        }
    }
    let mut slug = String::new();
    for c in out.chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() { slug.push(c); } else if !slug.ends_with('-') { slug.push('-'); }
    }
    let slug: String = slug.trim_matches('-').chars().take(24).collect::<String>().trim_matches('-').to_string();
    if slug.is_empty() { "kategori".into() } else { slug }
}

fn clean_label(label: &str) -> std::result::Result<String, String> {
    let t = label.trim();
    if t.is_empty() { return Err("Kategori adı boş olamaz.".into()); }
    if t.chars().count() > MAX_CATEGORY_LABEL { return Err("Kategori adı en fazla 40 karakter olmalı.".into()); }
    Ok(t.to_string())
}

fn clean_category_color(color: Option<&str>) -> std::result::Result<Option<String>, String> {
    match color.map(str::trim).filter(|c| !c.is_empty()) {
        None => Ok(None),
        Some(c) if c.len() <= 20 && c.chars().all(|ch| ch.is_ascii_alphanumeric() || ch == '#' || ch == '-') => Ok(Some(c.to_string())),
        Some(_) => Err("Geçersiz renk.".into()),
    }
}

pub fn add_category(db: &Connection, label: &str, color: Option<&str>) -> std::result::Result<NoteCategory, String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let label = clean_label(label)?;
    let color = clean_category_color(color)?;
    let e = |e: rusqlite::Error| e.to_string();
    let base = slugify_category_id(&label);
    let mut id = base.clone();
    let mut n = 2;
    while db.query_row("SELECT EXISTS(SELECT 1 FROM note_categories WHERE id=?1)", [&id], |r| r.get::<_, bool>(0)).map_err(e)? {
        id = format!("{base}-{n}");
        n += 1;
    }
    let position: i64 = db.query_row("SELECT coalesce(max(position),-1)+1 FROM note_categories", [], |r| r.get(0)).map_err(e)?;
    let now = now_millis();
    db.execute("INSERT INTO note_categories(id,label,color,position,builtin,created_at) VALUES(?1,?2,?3,?4,0,?5)", params![id, label, color, position, now]).map_err(e)?;
    Ok(NoteCategory { id, label, color, position, builtin: false, created_at: now })
}

pub fn rename_category(db: &Connection, id: &str, label: &str) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let label = clean_label(label)?;
    let n = db.execute("UPDATE note_categories SET label=?1 WHERE id=?2", params![label, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Kategori bulunamadı.".into()); }
    Ok(())
}

pub fn recolor_category(db: &Connection, id: &str, color: Option<&str>) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let color = clean_category_color(color)?;
    let n = db.execute("UPDATE note_categories SET color=?1 WHERE id=?2", params![color, id]).map_err(|e| e.to_string())?;
    if n == 0 { return Err("Kategori bulunamadı.".into()); }
    Ok(())
}

pub fn reorder_categories(db: &Connection, ids: &[String]) -> std::result::Result<(), String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute("UPDATE note_categories SET position=?1 WHERE id=?2", params![i as i64, id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}

/// "Notlar" silinemez. Kategorideki tüm notlar (çöptekiler dahil) tek işlemde "Notlar"a taşınır; taşınan sayıyı döndürür.
pub fn delete_category(db: &Connection, id: &str) -> std::result::Result<i64, String> {
    ensure_note_meta(db).map_err(|e| e.to_string())?;
    if id == DEFAULT_CATEGORY { return Err("\"Notlar\" kategorisi silinemez.".into()); }
    let e = |e: rusqlite::Error| e.to_string();
    let tx = db.unchecked_transaction().map_err(e)?;
    let exists: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM note_categories WHERE id=?1)", [id], |r| r.get(0)).map_err(e)?;
    if !exists { return Err("Kategori bulunamadı.".into()); }
    let moved = tx.execute("UPDATE notes SET category=?1 WHERE category=?2", params![DEFAULT_CATEGORY, id]).map_err(e)? as i64;
    tx.execute("DELETE FROM note_categories WHERE id=?1", [id]).map_err(e)?;
    tx.commit().map_err(e)?;
    Ok(moved)
}

pub fn get_note(db: &Connection, id: i64) -> Result<Option<Note>> {
    ensure_note_meta(db)?;
    db.query_row(&format!("{} WHERE n.id=?1", select_sql(db)?), [id], row).optional()
}

pub const NOT_MOVED: &str = "Notlar henüz tarayıcıda. Eklentide Ayarlar → Depolama → \"Verileri masaüstüne taşı\" deyin.";

/// Eski çağrı biçimi: tüm notlar kapsamında sıralar.
#[cfg(test)]
pub fn reorder_notes(db: &Connection, ids: &[i64]) -> std::result::Result<(), String> {
    reorder_notes_scoped(db, ids, None)
}
