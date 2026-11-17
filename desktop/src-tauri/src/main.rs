#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ambient;
mod battery;
mod battery_win;
mod clipboard;
mod commands;
mod db;
mod extension_dir;
mod features;
mod native_host;
mod native_reg;
mod paste;
mod privacy;
mod state;
mod updater;
mod win;
mod video_dl;

use state::AppState;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use std::sync::Mutex;

struct ActiveShortcuts(Mutex<[Option<Shortcut>; 3]>);

/// Boş metin kısayolun kapalı olduğu anlamına gelir; kapalı kısayol kaydedilmez.
fn parse_shortcuts(picker: &str, snippets: &str, quicknote: &str) -> Result<[Option<Shortcut>; 3], String> {
    let parse = |value: &str| -> Result<Option<Shortcut>, String> {
        if value.trim().is_empty() { return Ok(None); }
        let shortcut: Shortcut = value.parse().map_err(|_| "Geçersiz kısayol".to_string())?;
        if !shortcut.mods.intersects(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER) {
            return Err("Kısayol Ctrl, Alt veya Win içermeli".into());
        }
        Ok(Some(shortcut))
    };
    let values = [parse(picker)?, parse(snippets)?, parse(quicknote)?];
    for i in 0..values.len() {
        for j in (i + 1)..values.len() {
            if values[i].is_some() && values[i] == values[j] {
                return Err("Kısayollar birbirinden farklı olmalı".into());
            }
        }
    }
    Ok(values)
}

#[tauri::command]
fn shortcuts_set(app: AppHandle, picker: String, snippets: String, quicknote: String) -> Result<(), String> {
    let new = parse_shortcuts(&picker, &snippets, &quicknote)?;
    let active = app.state::<ActiveShortcuts>();
    let mut current = active.0.lock().map_err(|e| e.to_string())?;
    let old = *current;
    let manager = app.global_shortcut();
    let mut removed = Vec::new();
    for (i, sc) in old.iter().enumerate() {
        if let Some(sc) = sc {
            if let Err(e) = manager.unregister(*sc) {
                let mut restored = old;
                for (index, shortcut) in removed {
                    if manager.register(shortcut).is_err() { restored[index] = None; }
                }
                *current = restored;
                return Err(if restored == old { format!("Kısayol kaldırılamadı: {e}") } else { format!("Kısayol kaldırılamadı: {e}; önceki kısayollardan bazıları geri yüklenemedi") });
            }
            removed.push((i, *sc));
        }
    }
    let mut registered = Vec::new();
    let result = (|| -> Result<(), String> {
        for sc in new.into_iter().flatten() {
            manager.register(sc).map_err(|_| "Bu kısayol başka bir uygulama tarafından kullanılıyor".to_string())?;
            registered.push(sc);
        }
        let state = app.state::<Arc<AppState>>();
        let db = state.db();
        let mut prefs = db::load_prefs(&db).map_err(|e| e.to_string())?;
        prefs.picker_shortcut = picker.trim().to_string();
        prefs.snippets_shortcut = snippets.trim().to_string();
        prefs.quicknote_shortcut = quicknote.trim().to_string();
        db::save_prefs(&db, &prefs).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if let Err(error) = result {
        for sc in registered { let _ = manager.unregister(sc); }
        let mut restored = [None; 3];
        for (i, sc) in old.iter().enumerate() {
            if let Some(sc) = sc { if manager.register(*sc).is_ok() { restored[i] = Some(*sc); } }
        }
        *current = restored;
        if restored != old { return Err(format!("{error}; önceki kısayollardan bazıları geri yüklenemedi")); }
        return Err(error);
    }
    *current = new;
    Ok(())
}

#[cfg(test)]
mod shortcut_tests {
    use super::*;
    #[test]
    fn validates_shortcuts() {
        assert!(parse_shortcuts("Ctrl+Alt+V", "Ctrl+Shift+Space", "Ctrl+Alt+N").is_ok());
        assert!(parse_shortcuts("V", "Ctrl+Shift+Space", "").is_err());
        assert!(parse_shortcuts("Shift+V", "Ctrl+Shift+Space", "").is_err());
        assert!(parse_shortcuts("ctrl+alt+v", "Ctrl+Alt+V", "").is_err());
        assert!(parse_shortcuts("Ctrl+Alt+V", "", "Ctrl+Alt+V").is_err());
    }
    #[test]
    fn empty_shortcut_is_disabled() {
        let all_off = parse_shortcuts("", " ", "").unwrap();
        assert!(all_off.iter().all(|s| s.is_none()));
        let one_off = parse_shortcuts("Ctrl+Alt+V", "", "Ctrl+Alt+N").unwrap();
        assert!(one_off[0].is_some() && one_off[1].is_none() && one_off[2].is_some());
    }
}

/// Pilleri okur, tepsi ipucunu günceller ve (açıksa) eşik altı bildirimini verir.
fn refresh_batteries(app: &AppHandle) -> Vec<battery::DeviceBattery> {
    // Piller kapalıysa aygıtlar hiç taranmaz; tepside yalnızca sürüm görünür.
    let readings = if features::enabled(app, features::BATTERIES) { battery_win::read_all() } else { Vec::new() };
    if let Some(t) = app.tray_by_id("main") {
        let _ = t.set_tooltip(Some(battery::tooltip_text(&readings)));
    }
    let state = app.state::<Arc<AppState>>();
    let notify = db::load_prefs(&state.db()).map(|p| p.battery_notify).unwrap_or(true);
    if notify {
        let low = state
            .tracker
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .update(&readings, battery::LOW_THRESHOLD);
        if !low.is_empty() {
            let parts: Vec<String> = low.iter().filter_map(|d| d.percent.map(|p| format!("{} %{}", d.name, p))).collect();
            toast(app, &format!("Pil azaldı: {}", parts.join(", ")));
        }
    }
    readings
}

fn show_main(app: &AppHandle, section: Option<&str>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(s) = section {
            let _ = app.emit_to("main", "navigate", s);
        }
    }
}

/// Kısa süreli, odağı çalmayan bildirim penceresi.
fn toast(app: &AppHandle, msg: &str) {
    let Some(w) = app.get_webview_window("toast") else { return };
    let state = app.state::<Arc<AppState>>();
    let gen = state.toast_gen.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(Some(m)) = w.primary_monitor() {
        let (p, s) = (m.position(), m.size());
        let (ww, wh) = w
            .outer_size()
            .map(|z| (z.width as i32, z.height as i32))
            .unwrap_or((320, 52));
        let x = p.x + s.width as i32 - ww - 24;
        let y = p.y + s.height as i32 - wh - 72;
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    let _ = app.emit_to("toast", "toast", msg);
    match w.hwnd() {
        Ok(h) => win::show_no_activate(h.0 as isize),
        Err(_) => {
            let _ = w.show();
        }
    }
    let state = state.inner().clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1800));
        if state.toast_gen.load(Ordering::SeqCst) == gen {
            let _ = w.hide();
        }
    });
}

fn place_near_cursor(w: &WebviewWindow) {
    let Some((cx, cy)) = win::cursor_pos() else { return };
    let (ww, wh) = w
        .outer_size()
        .map(|s| (s.width as i32, s.height as i32))
        .unwrap_or((420, 360));
    let (mut x, mut y) = (cx + 8, cy + 8);
    if let Ok(ms) = w.available_monitors() {
        let found = ms.iter().find(|m| {
            let (p, s) = (m.position(), m.size());
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        });
        if let Some(m) = found {
            let (p, s) = (m.position(), m.size());
            x = x.min(p.x + s.width as i32 - ww).max(p.x);
            y = y.min(p.y + s.height as i32 - wh).max(p.y);
        }
    }
    let _ = w.set_position(PhysicalPosition::new(x, y));
}

fn toggle_picker(app: &AppHandle) {
    if !features::enabled(app, features::CLIPBOARD) { return; }
    let Some(w) = app.get_webview_window("picker") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    place_near_cursor(&w);
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("picker", "picker-open", ());
}

fn toggle_snippets(app: &AppHandle) {
    if !features::enabled(app, features::SNIPPETS) { return; }
    let Some(w) = app.get_webview_window("snippets") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    // Seçici açılmadan önceki pencere: ekleme sonrası odak buraya döner.
    app.state::<Arc<AppState>>()
        .snippet_target
        .store(paste::foreground_raw(), Ordering::SeqCst);
    place_near_cursor(&w);
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("snippets", "snippets-open", ());
}

fn toggle_quicknote(app: &AppHandle) {
    if !features::enabled(app, features::NOTES) { return; }
    let Some(w) = app.get_webview_window("quicknote") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    place_near_cursor(&w);
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit_to("quicknote", "quicknote-open", ());
}

/// Zamanı gelen not hatırlatmalarını Windows bildirimi olarak gösterir.
fn fire_reminders(app: &AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let state = app.state::<Arc<AppState>>();
    let due = match db::take_due_reminders(&state.db(), db::now_millis()) {
        Ok(d) => d,
        Err(e) => { eprintln!("Hatırlatmalar okunamadı: {e}"); return; }
    };
    if due.is_empty() { return; }
    for (_, text) in &due {
        let body: String = text.lines().next().unwrap_or("").chars().take(120).collect();
        if app.notification().builder().title("LifeTools hatırlatma").body(body.clone()).show().is_err() {
            toast(app, &format!("Hatırlatma: {body}"));
        }
    }
    let _ = app.emit_to("main", "notes-changed", ());
}

/// Görev çubuğu açık temada mı (HKCU ...\Themes\Personalize\SystemUsesLightTheme = 1)?
fn taskbar_is_light() -> bool {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let wide = |s: &str| s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let sub = wide(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
    let name = wide("SystemUsesLightTheme");
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let r = unsafe {
        RegGetValueW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()), PCWSTR(name.as_ptr()), RRF_RT_REG_DWORD, None,
            Some(&mut value as *mut u32 as *mut std::ffi::c_void), Some(&mut size))
    };
    r == ERROR_SUCCESS && value == 1
}

/// 0 = koyu ikon, 1 = açık ikon, 2 = henüz ayarlanmadı.
static TRAY_LIGHT: std::sync::atomic::AtomicU8 = std::sync::atomic::AtomicU8::new(2);

/// Tepsi ikonu: yapraklı LifeTools logosu. Koyu görev çubuğunda açık lila, açık görev çubuğunda koyu mor sürümü
/// (design/logo/*_512.png'den 32 px'e küçültüldü). Değişmediyse dokunmaz.
fn sync_tray_icon(app: &AppHandle) {
    let light = taskbar_is_light();
    if TRAY_LIGHT.swap(light as u8, Ordering::SeqCst) == light as u8 {
        return;
    }
    let bytes: &[u8] = if light { include_bytes!("../icons/tray-logo-light-32.png") } else { include_bytes!("../icons/tray-logo-dark-32.png") };
    match (app.tray_by_id("main"), tauri::image::Image::from_bytes(bytes)) {
        (Some(tray), Ok(image)) => { let _ = tray.set_icon(Some(image)); }
        (_, Err(e)) => eprintln!("Tepsi ikonu okunamadı: {e}"),
        _ => {}
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "LifeTools'u aç", true, None::<&str>)?;
    let clip = MenuItem::with_id(app, "clipboard", "Pano geçmişi", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quicknote", "Hızlı not", true, None::<&str>)?;
    let ambient = MenuItem::with_id(app, "ambient", "Ortam sesi: Oynat/Durdur", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Ayarlar", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let items: [&dyn IsMenuItem<tauri::Wry>; 7] = [&open, &clip, &quick, &ambient, &settings, &sep, &quit];
    let menu = Menu::with_items(app, &items)?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip(format!("LifeTools {}", app.package_info().version))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app, None),
            "clipboard" => show_main(app, Some("clipboard")),
            "settings" => show_main(app, Some("settings")),
            "quicknote" => toggle_quicknote(app),
            // Ses ana pencerenin (gizli kalsa da çalışan) web görünümünde üretilir.
            "ambient" => {
                let _ = app.emit_to("main", "ambient-toggle", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    sync_tray_icon(app.handle());
    Ok(())
}

fn run_maintenance(state: &AppState) {
    let db = state.db();
    if let Ok(s) = db::load_settings(&db) {
        let _ = db::expire_older_than_days(&db, db::now_secs(), s.expire_days);
        let _ = db::enforce_limit(&db, s.max_items);
    }
}

fn init_state() -> Result<Arc<AppState>, Box<dyn std::error::Error>> {
    let path = db::default_path()?;
    let mut conn = db::open(&path)?;
    db::migrate(&mut conn)?;
    Ok(Arc::new(AppState::new(conn)))
}

fn main() {
    // Chrome Native Messaging ana bilgisayarı olarak başlatıldıysa: Tauri/tek örnek öncesinde köprüyü çalıştır.
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.iter().any(|a| a == "--install-video-tools") {
        video_dl::install_helper();
        return;
    }
    if args.iter().any(|a| a.starts_with("chrome-extension://")) {
        std::process::exit(native_host::run(&args));
    }

    let app_state = match init_state() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Veritabanı açılamadı: {e}");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app, None);
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    let active = app.state::<ActiveShortcuts>();
                    let action = active.0.lock().ok().and_then(|values| values.iter().position(|s| s.as_ref() == Some(shortcut)));
                    match action {
                        Some(0) => toggle_picker(app),
                        Some(1) => toggle_snippets(app),
                        Some(2) => toggle_quicknote(app),
                        _ => {}
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if matches!(window.label(), "picker" | "snippets" | "quicknote") => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::video_tools_status,
            commands::video_tools_install,
            commands::video_tools_update,
            commands::video_open_folder,
            commands::video_download,
            commands::video_job,
            commands::video_jobs,
            commands::video_cancel,
            commands::dashboard_summary,
            commands::backup_export,
            commands::clipboard_list,
            commands::clipboard_copy,
            commands::clipboard_pin,
            commands::clipboard_delete,
            commands::clipboard_clear,
            commands::get_setting,
            commands::set_setting,
            commands::settings_get,
            commands::settings_set,
            commands::autostart_get,
            commands::autostart_set,
            commands::picker_hide,
            commands::note_list,
            commands::note_add,
            commands::note_update,
            commands::note_delete,
            commands::note_open_url,
            commands::watch_list,
            commands::watch_add,
            commands::watch_update,
            commands::watch_set_status,
            commands::watch_delete,
            commands::note_set_text,
            commands::note_set_category,
            commands::note_set_pinned,
            commands::note_set_done,
            commands::note_set_archived,
            commands::note_set_reminder,
            commands::note_image,
            commands::note_page,
            commands::quicknote_add,
            commands::quicknote_hide,
            commands::snippet_list,
            commands::snippet_save,
            commands::snippet_delete,
            commands::snippet_insert,
            commands::snippet_picker_hide,
            shortcuts_set,
            commands::prefs_get,
            commands::prefs_set,
            commands::battery_list,
            commands::ambient_preset_list,
            commands::ambient_preset_save,
            commands::ambient_preset_delete,
            commands::ambient_last_get,
            commands::ambient_last_set,
            commands::toast_show,
            commands::native_status,
            commands::native_register,
            commands::native_unregister,
            commands::update_check,
            commands::update_install,
            commands::get_auto_update,
            commands::set_auto_update,
            commands::extension_info,
            commands::extension_open_folder,
        ])
        // Durum, config pencereleri oluşturulmadan önce kaydedilmeli; yoksa ilk invoke "state not managed" hatası verir.
        .manage(app_state)
        .manage(ActiveShortcuts(Mutex::new([None; 3])))
        .setup(|app| {
            let state = app.state::<Arc<AppState>>().inner().clone();

            build_tray(app)?;

            let mut prefs = db::load_prefs(&state.db()).unwrap_or_default();
            let shortcuts = parse_shortcuts(&prefs.picker_shortcut, &prefs.snippets_shortcut, &prefs.quicknote_shortcut).unwrap_or_else(|_| {
                let defaults = db::Prefs::default();
                prefs.picker_shortcut = defaults.picker_shortcut;
                prefs.snippets_shortcut = defaults.snippets_shortcut;
                prefs.quicknote_shortcut = defaults.quicknote_shortcut;
                let _ = db::save_prefs(&state.db(), &prefs);
                parse_shortcuts(&prefs.picker_shortcut, &prefs.snippets_shortcut, &prefs.quicknote_shortcut).unwrap()
            });
            {
                // Kilit kayıt boyunca tutulur: işleyici, tablo dolmadan gelen basışı yok saymaz, bekler.
                let active = app.state::<ActiveShortcuts>();
                let mut registered = active.0.lock().unwrap_or_else(|e| e.into_inner());
                for (i, sc) in shortcuts.into_iter().enumerate() {
                    let Some(sc) = sc else { continue };
                    match app.global_shortcut().register(sc) {
                        Ok(()) => registered[i] = Some(sc),
                        Err(e) => eprintln!("Kısayol kaydedilemedi ({sc:?}): {e}"),
                    }
                }
            }

            clipboard::spawn_listener(app.handle().clone(), state.clone());
            extension_dir::spawn_sync(app.handle().clone());
            // Kurulumdan hemen sonra eski native host işlemi birkaç saniye daha açık kalabilir; sonra tekrar dene.
            std::thread::spawn(|| {
                updater::cleanup_old_binaries();
                std::thread::sleep(Duration::from_secs(120));
                updater::cleanup_old_binaries();
            });
            updater::spawn_auto(app.handle().clone());

            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                refresh_batteries(&handle);
                std::thread::sleep(Duration::from_secs(300));
            });

            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                fire_reminders(&handle);
                // Kullanıcı Windows temasını değiştirirse tepsi ikonu ~20 sn içinde uyar (kayıt okuması ucuz).
                sync_tray_icon(&handle);
                std::thread::sleep(Duration::from_secs(20));
            });

            let st = state.clone();
            std::thread::spawn(move || loop {
                run_maintenance(&st);
                std::thread::sleep(Duration::from_secs(3600));
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("LifeTools başlatılamadı");
}
