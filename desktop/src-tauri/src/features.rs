//! Masaüstü özelliklerinin aç/kapat ayarı (Özellik rehberi). Değer `settings` tablosunda JSON olarak durur:
//! `{"piller": false, ...}`. Kayıt yoksa ya da okunamazsa özellik açık sayılır.
//! Kimlikler src/core/desktop-features.ts ile aynı olmalı.
use crate::db;
use crate::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub const KEY: &str = "desktop_features";

pub const NOTES: &str = "notlar";
pub const SNIPPETS: &str = "sablonlar";
pub const CLIPBOARD: &str = "pano";
pub const BATTERIES: &str = "piller";

/// JSON ayarında `id` açık mı? Yalnızca açıkça `false` yazılmışsa kapalıdır.
pub fn enabled_in(raw: Option<&str>, id: &str) -> bool {
    let Some(raw) = raw else { return true };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else { return true };
    value.get(id).and_then(|v| v.as_bool()) != Some(false)
}

pub fn enabled(app: &AppHandle, id: &str) -> bool {
    let state = app.state::<Arc<AppState>>();
    let raw = db::get_setting(&state.db(), KEY).ok().flatten();
    enabled_in(raw.as_deref(), id)
}

#[cfg(test)]
mod tests {
    use super::enabled_in;

    #[test]
    fn missing_or_broken_means_on() {
        assert!(enabled_in(None, "piller"));
        assert!(enabled_in(Some("bozuk"), "piller"));
        assert!(enabled_in(Some("{}"), "piller"));
        assert!(enabled_in(Some(r#"{"piller":"x"}"#), "piller"));
    }

    #[test]
    fn only_explicit_false_disables() {
        assert!(!enabled_in(Some(r#"{"piller":false}"#), "piller"));
        assert!(enabled_in(Some(r#"{"piller":true,"pano":false}"#), "piller"));
        assert!(!enabled_in(Some(r#"{"piller":true,"pano":false}"#), "pano"));
    }
}
