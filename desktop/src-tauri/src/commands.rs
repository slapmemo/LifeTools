use crate::db::{self, ClipboardItem, Settings};
use crate::electricity::{self, Electricity, Estimate};
use crate::state::AppState;
use crate::win::{self, PinnedWindow};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

type St<'a> = State<'a, Arc<AppState>>;

#[tauri::command]
pub fn dashboard_summary(app: AppHandle, state: St) -> Result<db::DashboardSummary, String> {
    let mut summary = {
        let db = state.db();
        let today: String = db.query_row("SELECT date('now','localtime')", [], |r| r.get(0)).map_err(err)?;
        db::dashboard_summary(&db, &today).map_err(err)?
    };
    summary.batteries = crate::refresh_batteries(&app);
    Ok(summary)
}

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
pub fn clipboard_list(state: St, query: String) -> Result<Vec<ClipboardItem>, String> {
    db::list_clips(&state.db(), &query).map_err(err)
}

#[tauri::command]
pub fn clipboard_copy(state: St, id: i64) -> Result<(), String> {
    let text = db::get_clip_text(&state.db(), id)
        .map_err(err)?
        .ok_or_else(|| "Kayıt bulunamadı.".to_string())?;
    *state.suppress.lock().unwrap_or_else(|e| e.into_inner()) = Some((text.clone(), Instant::now()));
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text)).map_err(err)
}

#[tauri::command]
pub fn clipboard_pin(state: St, id: i64, pinned: bool) -> Result<(), String> {
    db::set_pinned(&state.db(), id, pinned).map_err(err)
}

#[tauri::command]
pub fn clipboard_delete(state: St, id: i64) -> Result<(), String> {
    db::delete_clip(&state.db(), id).map_err(err)
}

#[tauri::command]
pub fn clipboard_clear(state: St) -> Result<usize, String> {
    db::clear_unpinned(&state.db()).map_err(err)
}

#[tauri::command]
pub fn settings_get(state: St) -> Result<Settings, String> {
    db::load_settings(&state.db()).map_err(err)
}

#[tauri::command]
pub fn get_setting(state: St, key: String) -> Result<Option<String>, String> {
    db::get_setting(&state.db(), &key).map_err(err)
}

#[tauri::command]
pub fn set_setting(state: St, key: String, value: String) -> Result<(), String> {
    db::set_setting(&state.db(), &key, &value).map_err(err)
}

#[tauri::command]
pub fn settings_set(state: St, settings: Settings) -> Result<Settings, String> {
    let db = state.db();
    let saved = db::save_settings(&db, settings).map_err(err)?;
    let _ = db::expire_older_than_days(&db, db::now_secs(), saved.expire_days);
    let _ = db::enforce_limit(&db, saved.max_items);
    Ok(saved)
}

#[tauri::command]
pub fn autostart_get(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(err)
}

#[tauri::command]
pub fn autostart_set(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let m = app.autolaunch();
    if enabled {
        m.enable().map_err(err)?;
    } else {
        m.disable().map_err(err)?;
    }
    m.is_enabled().map_err(err)
}

#[tauri::command]
pub fn windows_list(state: St) -> Vec<PinnedWindow> {
    win::list_pinned(&state.pinned)
}

#[tauri::command]
pub fn windows_release(app: AppHandle, state: St, hwnd: i64) -> Vec<PinnedWindow> {
    win::release(&state.pinned, hwnd as isize);
    let _ = app.emit("windows-changed", ());
    win::list_pinned(&state.pinned)
}

#[tauri::command]
pub fn windows_release_all(app: AppHandle, state: St) -> Vec<PinnedWindow> {
    win::release_all(&state.pinned);
    let _ = app.emit("windows-changed", ());
    win::list_pinned(&state.pinned)
}

#[tauri::command]
pub fn picker_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("picker") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn snippet_list(state: St, query: String) -> Result<Vec<db::Snippet>, String> {
    db::list_snippets(&state.db(), &query).map_err(err)
}

#[tauri::command]
pub fn snippet_save(state: St, id: Option<i64>, trigger: String, title: String, body: String) -> Result<i64, String> {
    db::save_snippet(&state.db(), id, &trigger, &title, &body)
}

#[tauri::command]
pub fn snippet_delete(state: St, id: i64) -> Result<(), String> {
    db::delete_snippet(&state.db(), id).map(|_| ()).map_err(err)
}

#[tauri::command]
pub fn snippet_insert(app: AppHandle, state: St, id: i64) -> Result<(), String> {
    match crate::paste::insert(&app, state.inner(), id) {
        Ok(Some(note)) => {
            crate::toast(&app, &note);
            Ok(())
        }
        Ok(None) => Ok(()),
        Err(e) => {
            crate::toast(&app, &e);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn snippet_picker_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("snippets") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn prefs_get(state: St) -> Result<db::Prefs, String> {
    db::load_prefs(&state.db()).map_err(err)
}

#[tauri::command]
pub fn prefs_set(state: St, prefs: db::Prefs) -> Result<(), String> {
    db::save_prefs(&state.db(), &prefs).map_err(err)
}

#[tauri::command]
pub fn battery_list(app: AppHandle) -> Vec<crate::battery::DeviceBattery> {
    crate::refresh_batteries(&app)
}

#[tauri::command]
pub fn ambient_preset_list(state: St) -> Result<Vec<db::AmbientPreset>, String> {
    db::list_presets(&state.db()).map_err(err)
}

#[tauri::command]
pub fn ambient_preset_save(state: St, name: String, config_json: String) -> Result<i64, String> {
    db::save_preset(&state.db(), &name, &config_json)
}

#[tauri::command]
pub fn ambient_preset_delete(state: St, id: i64) -> Result<(), String> {
    db::delete_preset(&state.db(), id).map(|_| ()).map_err(err)
}

#[tauri::command]
pub fn ambient_last_get(state: St) -> Result<Option<String>, String> {
    db::get_setting(&state.db(), "ambient_last").map_err(err)
}

#[tauri::command]
pub fn ambient_last_set(state: St, config_json: String) -> Result<(), String> {
    let json = crate::ambient::sanitize_config(&config_json)?;
    db::set_setting(&state.db(), "ambient_last", &json).map_err(err)
}

#[tauri::command]
pub fn toast_show(app: AppHandle, message: String) {
    crate::toast(&app, &message.chars().take(80).collect::<String>());
}

#[tauri::command]
pub fn native_status() -> Result<crate::native_reg::Status, String> {
    crate::native_reg::status()
}

#[tauri::command]
pub fn native_register() -> Result<crate::native_reg::Status, String> {
    crate::native_reg::register()
}

#[tauri::command]
pub fn native_unregister() -> Result<crate::native_reg::Status, String> {
    crate::native_reg::unregister()
}

#[tauri::command]
pub fn electricity_get(state: St) -> Result<Electricity, String> {
    let raw = db::get_setting(&state.db(), "electricity").map_err(err)?;
    Ok(raw.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default())
}

#[tauri::command]
pub fn electricity_save(state: St, data: Electricity) -> Result<(), String> {
    let json = serde_json::to_string(&data).map_err(err)?;
    db::set_setting(&state.db(), "electricity", &json).map_err(err)
}

#[tauri::command]
pub fn electricity_estimate(data: Electricity) -> Result<Estimate, String> {
    electricity::estimate(&data)
}
