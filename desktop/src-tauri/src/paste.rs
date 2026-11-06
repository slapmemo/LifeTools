//! Şablon ekleme: odağı geri yükle, Ctrl+V gönder (SendInput), panoyu geri koy. Enter/gönder asla yollanmaz.
use crate::state::AppState;
use crate::{db, win};
use arboard::SetExtWindows;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    VK_CONTROL, VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, SetForegroundWindow};

pub fn foreground_raw() -> isize {
    unsafe { GetForegroundWindow().0 as isize }
}

fn focus(raw: isize) -> bool {
    if raw == 0 {
        return false;
    }
    let h = win::hwnd_from_raw(raw);
    for _ in 0..12 {
        unsafe {
            let _ = SetForegroundWindow(h);
        }
        std::thread::sleep(Duration::from_millis(30));
        if foreground_raw() == raw {
            return true;
        }
    }
    false
}

fn key(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    }
}

fn send_ctrl_v() -> bool {
    let none = KEYBD_EVENT_FLAGS(0);
    let inputs = [
        key(VK_CONTROL, none),
        key(VK_V, none),
        key(VK_V, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) == inputs.len() as u32 }
}

/// Başarıda `Ok(None)`; kullanıcıya gösterilecek bir not varsa `Ok(Some(not))`.
pub fn insert(app: &AppHandle, state: &Arc<AppState>, id: i64) -> Result<Option<String>, String> {
    let (body, prefs) = {
        let d = state.db();
        let body = db::get_snippet_body(&d, id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Şablon bulunamadı.".to_string())?;
        let _ = db::bump_snippet_use(&d, id);
        (body, db::load_prefs(&d).unwrap_or_default())
    };
    let target = state.snippet_target.swap(0, Ordering::SeqCst);

    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let prev = cb.get_text().ok();
    state.mark_programmatic(&body);
    if let Some(p) = &prev {
        state.mark_programmatic(p);
    }
    cb.set()
        .exclude_from_history()
        .exclude_from_cloud()
        .text(body)
        .map_err(|e| e.to_string())?;
    drop(cb);

    if let Some(w) = app.get_webview_window("snippets") {
        let _ = w.hide();
    }
    if prefs.copy_only {
        return Ok(Some("Şablon panoya kopyalandı.".into()));
    }
    if !focus(target) {
        return Ok(Some("Hedef pencereye dönülemedi; şablon panoya kopyalandı.".into()));
    }
    std::thread::sleep(Duration::from_millis(40));
    if !send_ctrl_v() {
        return Ok(Some("Yapıştırılamadı (hedef yönetici yetkisinde olabilir); şablon panoya kopyalandı.".into()));
    }
    if let Some(p) = prev {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(400));
            let _ = arboard::Clipboard::new().and_then(|mut c| c.set_text(p));
        });
    }
    Ok(None)
}
