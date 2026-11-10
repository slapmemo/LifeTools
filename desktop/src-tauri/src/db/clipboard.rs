use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::Serialize;
use super::{MAX_TEXT_CHARS, PREVIEW_CHARS};

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

