use rusqlite::{Connection, OptionalExtension, Result};
use serde::Serialize;

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

/// Eklenti ayarları Chrome depolamasındadır; masaüstü veritabanında bulunmaz.
pub fn backup_data(db: &Connection) -> std::result::Result<serde_json::Value, String> {
    use rusqlite::types::ValueRef;
    let tx = db.unchecked_transaction().map_err(|e| e.to_string())?;
    let version = if table_exists(&tx, "meta").map_err(|e| e.to_string())? {
        tx.query_row("SELECT value FROM meta WHERE key='schema_version'", [], |r| r.get::<_, String>(0))
            .optional().map_err(|e| e.to_string())?
            .and_then(|v| v.parse::<i64>().ok()).filter(|v| *v >= 0).unwrap_or(0)
    } else { 0 };
    let timestamp: String = tx.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| r.get(0)).map_err(|e| e.to_string())?;
    let mut tables = serde_json::Map::new();
    for name in ["notes", "snippets", "tasks", "site_time", "sessions", "session_tabs", "tab_labels", "tab_notes", "watch_items", "note_pages", "note_images"] {
        if !table_exists(&tx, name).map_err(|e| e.to_string())? { continue; }
        let mut stmt = tx.prepare(&format!("SELECT * FROM {name} ORDER BY rowid")).map_err(|e| e.to_string())?;
        let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut data = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut object = serde_json::Map::new();
            for (i, column) in columns.iter().enumerate() {
                let value = match row.get_ref(i).map_err(|e| e.to_string())? {
                    ValueRef::Null => serde_json::Value::Null,
                    ValueRef::Integer(v) => v.into(),
                    ValueRef::Real(v) => serde_json::Number::from_f64(v).map(serde_json::Value::Number).ok_or("Geçersiz sayı")?,
                    ValueRef::Text(v) => std::str::from_utf8(v).map_err(|e| e.to_string())?.into(),
                    ValueRef::Blob(_) => return Err("Yedeklenemeyen ikili veri bulundu".into()),
                };
                object.insert(column.clone(), value);
            }
            data.push(serde_json::Value::Object(object));
        }
        tables.insert(name.into(), data.into());
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(serde_json::json!({"app":"LifeTools", "format":1, "schema_version":version, "exported_at":timestamp, "tables":tables, "settings":{}}))
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

