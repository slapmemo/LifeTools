use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use super::{get_setting, now_secs, set_setting};

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
    pub picker_shortcut: String,
    pub snippets_shortcut: String,
    pub topmost_shortcut: String,
    /// Yeni sürümleri otomatik indirip kur.
    pub auto_update: bool,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs { battery_notify: true, copy_only: false, picker_shortcut: "Ctrl+Alt+V".into(), snippets_shortcut: "Ctrl+Shift+Space".into(), topmost_shortcut: "Ctrl+Alt+T".into(), auto_update: true }
    }
}

pub fn load_prefs(db: &Connection) -> Result<Prefs> {
    Ok(get_setting(db, "prefs")?.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}

pub fn save_prefs(db: &Connection, p: &Prefs) -> Result<()> {
    set_setting(db, "prefs", &serde_json::to_string(p).unwrap_or_default())
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

