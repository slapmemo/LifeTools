#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ambient;
mod battery;
mod battery_win;
mod clipboard;
mod commands;
mod db;
mod electricity;
mod paste;
mod privacy;
mod state;
mod win;

use state::AppState;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

fn picker_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV)
}

fn topmost_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyT)
}

fn snippets_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space)
}

/// Pilleri okur, tepsi ipucunu günceller ve (açıksa) eşik altı bildirimini verir.
fn refresh_batteries(app: &AppHandle) -> Vec<battery::DeviceBattery> {
    let readings = battery_win::read_all();
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
            let parts: Vec<String> = low.iter().map(|d| format!("{} %{}", d.name, d.percent)).collect();
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

fn label_of(w: &win::PinnedWindow) -> String {
    let t = w.title.trim();
    let s = if t.is_empty() { w.exe.as_str() } else { t };
    let short: String = s.chars().take(40).collect();
    if short.is_empty() { "Pencere".to_string() } else { short }
}

fn toggle_topmost(app: &AppHandle) {
    let state = app.state::<Arc<AppState>>();
    match win::toggle_foreground(&state.pinned) {
        Ok(win::Toggle::Pinned(w)) => toast(app, &format!("Üstte tutuluyor: {}", label_of(&w))),
        Ok(win::Toggle::Released(w)) => toast(app, &format!("Üstte tutma kaldırıldı: {}", label_of(&w))),
        Err(e) => toast(app, &e),
    }
    let _ = app.emit("windows-changed", ());
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

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "LifeTools'u aç", true, None::<&str>)?;
    let clip = MenuItem::with_id(app, "clipboard", "Pano geçmişi", true, None::<&str>)?;
    let top = MenuItem::with_id(app, "topmost", "Etkin pencereyi üstte tut", true, None::<&str>)?;
    let ambient = MenuItem::with_id(app, "ambient", "Ortam sesi: Oynat/Durdur", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Ayarlar", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let items: [&dyn IsMenuItem<tauri::Wry>; 7] = [&open, &clip, &top, &ambient, &settings, &sep, &quit];
    let menu = Menu::with_items(app, &items)?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("LifeTools")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app, None),
            "clipboard" => show_main(app, Some("clipboard")),
            "settings" => show_main(app, Some("settings")),
            // Ses ana pencerenin (gizli kalsa da çalışan) web görünümünde üretilir.
            "ambient" => {
                let _ = app.emit_to("main", "ambient-toggle", ());
            }
            "topmost" => {
                // Menü kapandıktan sonra ön plan penceresi önceki pencereye döner.
                let app = app.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(250));
                    toggle_topmost(&app);
                });
            }
            "quit" => {
                let state = app.state::<Arc<AppState>>();
                win::release_all(&state.pinned);
                app.exit(0);
            }
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
    Ok(())
}

fn run_maintenance(state: &AppState) {
    let db = state.db();
    if let Ok(s) = db::load_settings(&db) {
        let _ = db::expire_older_than_days(&db, db::now_secs(), s.expire_days);
        let _ = db::enforce_limit(&db, s.max_items);
    }
}

fn main() {
    let picker_sc = picker_shortcut();
    let topmost_sc = topmost_shortcut();
    let snippets_sc = snippets_shortcut();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app, None);
        }))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &picker_sc {
                        toggle_picker(app);
                    } else if shortcut == &topmost_sc {
                        toggle_topmost(app);
                    } else if shortcut == &snippets_sc {
                        toggle_snippets(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if matches!(window.label(), "picker" | "snippets") => {
                let _ = window.hide();
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::clipboard_list,
            commands::clipboard_copy,
            commands::clipboard_pin,
            commands::clipboard_delete,
            commands::clipboard_clear,
            commands::settings_get,
            commands::settings_set,
            commands::autostart_get,
            commands::autostart_set,
            commands::windows_list,
            commands::windows_release,
            commands::windows_release_all,
            commands::picker_hide,
            commands::electricity_get,
            commands::electricity_save,
            commands::electricity_estimate,
            commands::snippet_list,
            commands::snippet_save,
            commands::snippet_delete,
            commands::snippet_insert,
            commands::snippet_picker_hide,
            commands::prefs_get,
            commands::prefs_set,
            commands::battery_list,
            commands::ambient_preset_list,
            commands::ambient_preset_save,
            commands::ambient_preset_delete,
            commands::ambient_last_get,
            commands::ambient_last_set,
            commands::toast_show,
        ])
        .setup(|app| {
            let path = db::default_path()?;
            let mut conn = rusqlite::Connection::open(path)?;
            db::migrate(&mut conn)?;
            let state = Arc::new(AppState::new(conn));
            app.manage(state.clone());

            build_tray(app)?;

            for sc in [picker_shortcut(), topmost_shortcut(), snippets_shortcut()] {
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!("Kısayol kaydedilemedi ({sc:?}): {e}");
                }
            }

            clipboard::spawn_listener(app.handle().clone(), state.clone());

            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                refresh_batteries(&handle);
                std::thread::sleep(Duration::from_secs(300));
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
