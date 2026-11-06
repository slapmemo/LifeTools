//! Pano dinleyici: gizli mesaj penceresi + AddClipboardFormatListener (yoklama yok).
use crate::privacy::{self, ClipboardMeta};
use crate::state::AppState;
use crate::{db, win};
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use windows::core::w;
use windows::Win32::Foundation::{HGLOBAL, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::DataExchange::{
    AddClipboardFormatListener, CloseClipboard, GetClipboardData, GetClipboardOwner,
    IsClipboardFormatAvailable, OpenClipboard, RegisterClipboardFormatW,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW, TranslateMessage,
    HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WM_CLIPBOARDUPDATE, WNDCLASSW,
};

static HANDLER: OnceLock<Box<dyn Fn(HWND) + Send + Sync>> = OnceLock::new();

pub fn spawn_listener(app: AppHandle, state: Arc<AppState>) {
    let _ = HANDLER.set(Box::new(move |hwnd| handle_update(&app, &state, hwnd)));
    std::thread::spawn(|| unsafe { run_loop() });
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    if msg == WM_CLIPBOARDUPDATE {
        if let Some(h) = HANDLER.get() {
            let _ = std::panic::catch_unwind(AssertUnwindSafe(|| h(hwnd)));
        }
        return LRESULT(0);
    }
    DefWindowProcW(hwnd, msg, wp, lp)
}

unsafe fn run_loop() {
    let hmod = GetModuleHandleW(None).unwrap_or_default();
    let hinst = windows::Win32::Foundation::HINSTANCE(hmod.0);
    let class = w!("LifeToolsClipboardListener");
    let wc = WNDCLASSW {
        lpfnWndProc: Some(wndproc),
        hInstance: hinst,
        lpszClassName: class,
        ..Default::default()
    };
    RegisterClassW(&wc);
    let hwnd = match CreateWindowExW(
        WINDOW_EX_STYLE(0),
        class,
        w!("LifeTools Pano"),
        WINDOW_STYLE(0),
        0,
        0,
        0,
        0,
        Some(HWND_MESSAGE),
        None,
        Some(hinst),
        None,
    ) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("Pano dinleyici penceresi oluşturulamadı: {e}");
            return;
        }
    };
    if let Err(e) = AddClipboardFormatListener(hwnd) {
        eprintln!("AddClipboardFormatListener başarısız: {e}");
        return;
    }
    let mut msg = MSG::default();
    while GetMessageW(&mut msg, None, 0, 0).0 > 0 {
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

/// (ExcludeClipboardContentFromMonitorProcessing var mı, CanIncludeInClipboardHistory değeri,
/// pano sahibi işlem adı, okunabildi mi)
unsafe fn read_meta(hwnd: HWND) -> (bool, Option<u32>, Option<String>, bool) {
    let fmt_excl = RegisterClipboardFormatW(w!("ExcludeClipboardContentFromMonitorProcessing"));
    let fmt_can = RegisterClipboardFormatW(w!("CanIncludeInClipboardHistory"));
    let exclude = fmt_excl != 0 && IsClipboardFormatAvailable(fmt_excl).is_ok();

    let mut opened = false;
    for _ in 0..8 {
        if OpenClipboard(Some(hwnd)).is_ok() {
            opened = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    if !opened {
        return (exclude, None, None, false);
    }

    let mut can = None;
    if fmt_can != 0 && IsClipboardFormatAvailable(fmt_can).is_ok() {
        if let Ok(h) = GetClipboardData(fmt_can) {
            let hg = HGLOBAL(h.0);
            if GlobalSize(hg) >= 4 {
                let p = GlobalLock(hg) as *const u32;
                if !p.is_null() {
                    can = Some(*p);
                    let _ = GlobalUnlock(hg);
                }
            }
        }
    }
    let process = GetClipboardOwner().ok().and_then(win::exe_name_of_hwnd);
    let _ = CloseClipboard();
    (exclude, can, process, true)
}

fn handle_update(app: &AppHandle, state: &Arc<AppState>, hwnd: HWND) {
    let settings = db::load_settings(&state.db()).unwrap_or_default();
    if settings.paused {
        return;
    }
    let (exclude, can, process, readable) = unsafe { read_meta(hwnd) };
    // Gizlilik meta verisi okunamadıysa temkinli davranıp kaydetme.
    if !readable {
        return;
    }
    let meta = ClipboardMeta {
        exclude_from_monitor: exclude,
        can_include_in_history: can,
        process: process.as_deref(),
    };
    if privacy::should_skip(&meta, &settings.exclusions) {
        return;
    }
    let text = match arboard::Clipboard::new().and_then(|mut c| c.get_text()) {
        Ok(t) => t,
        Err(_) => return,
    };
    {
        let mut s = state.suppress.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((t, at)) = s.as_ref() {
            if at.elapsed() < Duration::from_secs(5) {
                if *t == text {
                    return;
                }
            } else {
                *s = None;
            }
        }
    }
    let inserted = db::insert_clip(&state.db(), &text, db::now_secs(), settings.max_items).unwrap_or(false);
    if inserted {
        let _ = app.emit("clipboard-changed", ());
    }
}
