use crate::db::{self, ClipboardItem, Settings};
use crate::electricity::{self, Electricity, Estimate};
use crate::state::AppState;
use crate::win::{self, PinnedWindow};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

type St<'a> = State<'a, Arc<AppState>>;

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
