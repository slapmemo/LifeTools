use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use super::{fold, now_secs, MAX_TEXT_CHARS};

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

