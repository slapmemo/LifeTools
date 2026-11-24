use crate::db::{self, ClipboardItem, Settings};
use crate::state::AppState;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

type St<'a> = State<'a, Arc<AppState>>;

/// Pil okuma ~1 sn sürebilir; eşzamanlı komutlar ana iş parçacığında çalıştığı için arka planda yapılır.
#[tauri::command]
pub async fn dashboard_summary(app: AppHandle) -> Result<db::DashboardSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut summary = {
            let state = app.state::<Arc<AppState>>();
            let db = state.db();
            let today: String = db.query_row("SELECT date('now','localtime')", [], |r| r.get(0)).map_err(err)?;
            db::dashboard_summary(&db, &today).map_err(err)?
        };
        summary.batteries = crate::refresh_batteries(&app);
        Ok(summary)
    })
    .await
    .map_err(err)?
}

fn err<E: ToString>(e: E) -> String {
    e.to_string()
}

/// Büyük veritabanında okuma ve dosya yazma sürebilir; pencere donmasın diye arka planda çalışır.
#[tauri::command]
pub async fn backup_export(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || backup_export_blocking(&app)).await.map_err(err)?
}

fn backup_export_blocking(app: &AppHandle) -> Result<String, String> {
    let backup = {
        let state = app.state::<Arc<AppState>>();
        let db = state.db();
        db::backup_data(&db)?
    };
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

/// Metni değiştirir. `expected_updated_at` verilirse ve not başka yerde değişmişse `NOT_CONFLICT` hatası döner.
/// Eski çağrılar (`expected_updated_at` yok) aynen çalışır. Yeni `updated_at` değerini döndürür.
#[tauri::command]
pub fn note_set_text(state: St, id: i64, text: String, expected_updated_at: Option<i64>) -> Result<i64, String> {
    db::update_note_text_checked(&state.db(), id, &text, expected_updated_at)
}

/// Tek not (düzenleyici güncel `updated_at` değerini ve metni yeniden okumak için).
#[tauri::command]
pub fn note_get(state: St, id: i64) -> Result<Option<db::Note>, String> {
    db::get_note(&state.db(), id).map_err(err)
}

#[tauri::command]
pub fn note_set_user_note(state: St, id: i64, user_note: Option<String>) -> Result<(), String> {
    db::set_note_user_note(&state.db(), id, user_note.as_deref())
}

#[tauri::command]
pub fn note_duplicate(state: St, id: i64) -> Result<i64, String> {
    db::duplicate_note(&state.db(), id)
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
    db::delete_note(&state.db(), id)
}

/// Çöp kutusundaki notlar (en son silinen önce).
#[tauri::command]
pub fn note_trash_list(state: St) -> Result<Vec<db::Note>, String> {
    db::list_trash(&state.db()).map_err(err)
}

#[tauri::command]
pub fn note_restore(state: St, id: i64) -> Result<(), String> {
    db::restore_note(&state.db(), id)
}

/// Kalıcı siler (görsel, sayfa kopyası, geçmiş dahil).
#[tauri::command]
pub fn note_purge(state: St, id: i64) -> Result<(), String> {
    db::purge_note(&state.db(), id).map_err(err)
}

/// Çöpü boşaltır; silinen not sayısını döndürür.
#[tauri::command]
pub fn note_trash_empty(state: St) -> Result<i64, String> {
    db::empty_trash(&state.db()).map_err(err)
}

/// 15 günü geçen çöp notlarını kalıcı siler; silinen sayıyı döndürür.
#[tauri::command]
pub fn note_purge_expired(state: St) -> Result<i64, String> {
    db::purge_expired(&state.db(), db::now_millis(), db::TRASH_DAYS).map_err(err)
}

#[tauri::command]
pub fn note_set_color(state: St, id: i64, color: Option<String>) -> Result<(), String> {
    db::set_note_color(&state.db(), id, color.as_deref())
}

#[tauri::command]
pub fn note_set_position(state: St, id: i64, position: i64) -> Result<(), String> {
    db::set_note_position(&state.db(), id, position)
}

/// Elle sıralama: görünen satırların yeni sırası; `category` listenin kategori filtresi (yok: hepsi).
#[tauri::command]
pub fn note_reorder(state: St, ids: Vec<i64>, category: Option<String>) -> Result<(), String> {
    db::reorder_notes_scoped(&state.db(), &ids, category.as_deref().filter(|c| !c.is_empty()))
}

/// Kategori silinirse taşınacak not sayısı (arşivdekiler dahil).
#[tauri::command]
pub fn note_category_count(state: St, id: String) -> Result<i64, String> {
    db::category_note_count(&state.db(), &id)
}

#[tauri::command]
pub fn note_history(state: St, id: i64) -> Result<Vec<db::HistoryEntry>, String> {
    db::list_history(&state.db(), id).map_err(err)
}

#[tauri::command]
pub fn note_history_restore(state: St, history_id: i64) -> Result<(), String> {
    db::restore_history(&state.db(), history_id)
}

#[tauri::command]
pub fn note_categories(state: St) -> Result<Vec<db::NoteCategory>, String> {
    db::list_categories(&state.db()).map_err(err)
}

#[tauri::command]
pub fn note_category_add(state: St, label: String, color: Option<String>) -> Result<db::NoteCategory, String> {
    db::add_category(&state.db(), &label, color.as_deref())
}

#[tauri::command]
pub fn note_category_rename(state: St, id: String, label: String) -> Result<(), String> {
    db::rename_category(&state.db(), &id, &label)
}

#[tauri::command]
pub fn note_category_recolor(state: St, id: String, color: Option<String>) -> Result<(), String> {
    db::recolor_category(&state.db(), &id, color.as_deref())
}

#[tauri::command]
pub fn note_categories_reorder(state: St, ids: Vec<String>) -> Result<(), String> {
    db::reorder_categories(&state.db(), &ids)
}

/// Kategoriyi siler; notları "Notlar"a taşır ve taşınan sayıyı döndürür.
#[tauri::command]
pub fn note_category_delete(state: St, id: String) -> Result<i64, String> {
    db::delete_category(&state.db(), &id)
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
pub async fn battery_list(app: AppHandle) -> Result<Vec<crate::battery::DeviceBattery>, String> {
    tauri::async_runtime::spawn_blocking(move || crate::refresh_batteries(&app)).await.map_err(err)
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

/// İlk çağrıda `yt-dlp --version` çalıştırır; ana iş parçacığını bekletmesin.
#[tauri::command]
pub async fn video_tools_status() -> Result<crate::video_dl::ToolStatus, String> { tauri::async_runtime::spawn_blocking(crate::video_dl::status).await.map_err(|e| e.to_string())? }
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
pub async fn video_jobs() -> Result<Vec<crate::video_dl::JobStatus>, String> { tauri::async_runtime::spawn_blocking(crate::video_dl::list).await.map_err(|e| e.to_string())? }
#[tauri::command]
pub fn video_cancel(job_id: String) -> Result<(), String> { crate::video_dl::cancel(&job_id) }
