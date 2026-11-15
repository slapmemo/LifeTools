use crate::db::{self, ClipboardItem, Settings};
use crate::state::AppState;
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
pub fn backup_export(state: St) -> Result<String, String> {
    let backup = db::backup_data(&state.db())?;
    let date = &backup["exported_at"].as_str().ok_or("Tarih alınamadı")?[..10];
    let profile = std::env::var_os("USERPROFILE").ok_or("USERPROFILE bulunamadı")?;
    let dir = std::path::PathBuf::from(profile).join("Downloads").join("LifeTools").join("Yedekler");
    std::fs::create_dir_all(&dir).map_err(err)?;
    let path = dir.join(format!("lifetools-yedek-{date}.json"));
    let json = serde_json::to_vec_pretty(&backup).map_err(err)?;
    std::fs::write(&path, json).map_err(err)?;
    Ok(path.to_string_lossy().into_owned())
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
pub fn picker_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("picker") {
        let _ = w.hide();
    }
}

#[tauri::command]
pub fn note_list(state: St, category: String, query: String, archived: Option<bool>, show_done: Option<bool>, sort: Option<String>) -> Result<db::NotesPage, String> {
    let opts = db::ListOptions {
        category: &category, query: &query, archived: archived.unwrap_or(false),
        show_done: show_done.unwrap_or(true), sort: sort.as_deref().unwrap_or("new"),
    };
    db::list_notes(&state.db(), &opts).map_err(err)
}

#[tauri::command]
pub fn watch_list(state: St, status: String, kind: String, query: String) -> Result<db::WatchPage, String> {
    db::list_watch(&state.db(), &status, &kind, &query).map_err(err)
}

#[tauri::command]
pub fn watch_add(state: St, title: String, kind: String, url: Option<String>, note: Option<String>) -> Result<i64, String> {
    db::add_watch(&state.db(), &title, &kind, url.as_deref(), note.as_deref())
}

#[tauri::command]
pub fn watch_update(state: St, id: i64, title: String, kind: String, url: Option<String>, note: Option<String>) -> Result<(), String> {
    db::update_watch(&state.db(), id, &title, &kind, url.as_deref(), note.as_deref())
}

#[tauri::command]
pub fn watch_set_status(state: St, id: i64, status: String) -> Result<(), String> {
    db::set_watch_status(&state.db(), id, &status)
}

#[tauri::command]
pub fn watch_delete(state: St, id: i64) -> Result<(), String> {
    db::delete_watch(&state.db(), id).map_err(err)
}

#[tauri::command]
pub fn note_set_text(state: St, id: i64, text: String) -> Result<(), String> {
    db::update_note_text(&state.db(), id, &text)
}

#[tauri::command]
pub fn note_set_category(state: St, id: i64, category: String) -> Result<(), String> {
    db::set_note_category(&state.db(), id, &category)
}

#[tauri::command]
pub fn note_set_pinned(state: St, id: i64, pinned: bool) -> Result<(), String> {
    db::set_note_pinned(&state.db(), id, pinned)
}

#[tauri::command]
pub fn note_set_done(state: St, id: i64, done: bool) -> Result<(), String> {
    db::set_note_done(&state.db(), id, done)
}

#[tauri::command]
pub fn note_set_archived(state: St, id: i64, archived: bool) -> Result<(), String> {
    db::set_note_archived(&state.db(), id, archived)
}

/// `remind_at`: milisaniye; `None` hatırlatmayı kaldırır.
#[tauri::command]
pub fn note_set_reminder(state: St, id: i64, remind_at: Option<i64>) -> Result<(), String> {
    db::set_note_reminder(&state.db(), id, remind_at)
}

#[tauri::command]
pub fn note_image(state: St, id: i64) -> Result<Option<String>, String> {
    db::note_image(&state.db(), id).map_err(err)
}

#[tauri::command]
pub fn note_page(state: St, id: i64) -> Result<Option<db::NotePage>, String> {
    db::note_page(&state.db(), id).map_err(err)
}

/// Hızlı not penceresinden: not ekler, pencereyi gizler ve onay bildirimi gösterir.
#[tauri::command]
pub fn quicknote_add(app: AppHandle, state: St, category: String, text: String) -> Result<(), String> {
    db::add_note(&state.db(), &category, &text, None, None)?;
    if let Some(w) = app.get_webview_window("quicknote") { let _ = w.hide(); }
    crate::toast(&app, "Not eklendi");
    let _ = app.emit_to("main", "notes-changed", ());
    Ok(())
}

#[tauri::command]
pub fn quicknote_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("quicknote") { let _ = w.hide(); }
}

#[tauri::command]
pub fn note_add(state: St, category: String, text: String, url: Option<String>, user_note: Option<String>) -> Result<i64, String> {
    db::add_note(&state.db(), &category, &text, url.as_deref(), user_note.as_deref())
}

#[tauri::command]
pub fn note_update(state: St, id: i64, category: String, text: String, user_note: Option<String>) -> Result<(), String> {
    db::update_note(&state.db(), id, &category, &text, user_note.as_deref())
}

#[tauri::command]
pub fn note_delete(state: St, id: i64) -> Result<(), String> {
    db::delete_note(&mut state.db(), id).map_err(err)
}

/// Notun bağlantısını varsayılan tarayıcıda açar; yalnızca http(s) adresleri.
#[tauri::command]
pub fn note_open_url(url: String) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) || url.chars().any(|c| c.is_whitespace() || c == '"') {
        return Err("Yalnızca http(s) bağlantıları açılabilir.".into());
    }
    let root = std::env::var_os("SystemRoot").ok_or("SystemRoot bulunamadı")?;
    std::process::Command::new(std::path::PathBuf::from(root).join("explorer.exe"))
        .arg(url)
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(err)?;
    Ok(())
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
    let db = state.db();
    let mut current = db::load_prefs(&db).map_err(err)?;
    current.copy_only = prefs.copy_only;
    current.battery_notify = prefs.battery_notify;
    db::save_prefs(&db, &current).map_err(err)
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
pub async fn update_check(app: AppHandle) -> Result<crate::updater::CheckResult, String> {
    crate::updater::check_info(&app).await
}

#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<crate::updater::Outcome, String> {
    crate::updater::check_and_install(&app, true).await
}

#[tauri::command]
pub fn get_auto_update(state: St) -> Result<bool, String> {
    db::load_prefs(&state.db()).map(|p| p.auto_update).map_err(err)
}

#[tauri::command]
pub fn set_auto_update(state: St, enabled: bool) -> Result<bool, String> {
    let db = state.db();
    let mut prefs = db::load_prefs(&db).map_err(err)?;
    prefs.auto_update = enabled;
    db::save_prefs(&db, &prefs).map_err(err)?;
    Ok(enabled)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionInfo {
    dir: Option<String>,
    version: Option<String>,
}

#[tauri::command]
pub fn extension_info() -> ExtensionInfo {
    let dir = crate::extension_dir::target_dir();
    let version = dir.as_deref().and_then(crate::extension_dir::read_version);
    ExtensionInfo { dir: dir.map(|d| d.to_string_lossy().into_owned()), version }
}

#[tauri::command]
pub fn extension_open_folder() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    let dir = crate::extension_dir::target_dir().ok_or("LOCALAPPDATA bulunamadı")?;
    if !dir.is_dir() {
        return Err("Eklenti klasörü henüz oluşturulmadı".into());
    }
    let root = std::env::var_os("SystemRoot").ok_or("SystemRoot bulunamadı")?;
    std::process::Command::new(std::path::PathBuf::from(root).join("explorer.exe"))
        .arg(dir)
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn video_tools_status() -> Result<crate::video_dl::ToolStatus, String> { crate::video_dl::status() }
#[tauri::command]
pub fn video_tools_install() -> Result<(), String> { crate::video_dl::begin_install() }
#[tauri::command]
pub async fn video_tools_update() -> Result<(), String> { tauri::async_runtime::spawn_blocking(crate::video_dl::update).await.map_err(|e| e.to_string())? }
#[tauri::command]
pub fn video_open_folder() -> Result<(), String> { crate::video_dl::open_folder() }
#[tauri::command]
pub fn video_download(url: String, mode: String) -> Result<String, String> { crate::video_dl::start(&url, &mode, None) }
#[tauri::command]
pub fn video_job(job_id: String) -> Result<crate::video_dl::JobStatus, String> { crate::video_dl::job_status(&job_id) }
#[tauri::command]
pub fn video_jobs() -> Result<Vec<crate::video_dl::JobStatus>, String> { crate::video_dl::list() }
#[tauri::command]
pub fn video_cancel(job_id: String) -> Result<(), String> { crate::video_dl::cancel(&job_id) }
