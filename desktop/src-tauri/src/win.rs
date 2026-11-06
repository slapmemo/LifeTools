//! Win32 yardımcıları: işlem adı, üstte tutma, imleç konumu.
use serde::Serialize;
use std::sync::Mutex;
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, POINT};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
    PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, GetCursorPos, GetDesktopWindow, GetForegroundWindow, GetShellWindow,
    GetWindowLongPtrW, GetWindowTextW, GetWindowThreadProcessId, SetWindowPos, ShowWindow,
    GWL_EXSTYLE, HWND_NOTOPMOST, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    SW_SHOWNOACTIVATE, WS_EX_TOPMOST,
};

#[derive(Serialize, Clone, Debug)]
pub struct PinnedWindow {
    pub hwnd: isize,
    pub title: String,
    pub exe: String,
}

pub enum Toggle {
    Pinned(PinnedWindow),
    Released(PinnedWindow),
}

pub fn hwnd_from_raw(raw: isize) -> HWND {
    HWND(raw as *mut core::ffi::c_void)
}

/// İşlemin exe dosya adı (ör. `notepad.exe`).
pub fn exe_name_of_hwnd(hwnd: HWND) -> Option<String> {
    unsafe {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 {
            return None;
        }
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 520];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        r.ok()?;
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/']).next().map(|s| s.to_string())
    }
}

fn window_text(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn class_name(hwnd: HWND) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(hwnd, &mut buf) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

/// Masaüstü, görev çubuğu, Başlat/Arama ve LifeTools'un kendisi yok sayılır.
fn is_ignored(hwnd: HWND) -> bool {
    if hwnd.0.is_null() {
        return true;
    }
    unsafe {
        if hwnd == GetDesktopWindow() || hwnd == GetShellWindow() {
            return true;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == 0 || pid == GetCurrentProcessId() {
            return true;
        }
    }
    matches!(
        class_name(hwnd).as_str(),
        "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow"
    )
}

fn is_topmost(hwnd: HWND) -> bool {
    unsafe { (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOPMOST.0) != 0 }
}

fn is_alive(hwnd: HWND) -> bool {
    unsafe { GetWindowThreadProcessId(hwnd, None) != 0 }
}

pub fn set_topmost(hwnd: HWND, on: bool) -> Result<(), String> {
    let after = if on { HWND_TOPMOST } else { HWND_NOTOPMOST };
    unsafe {
        SetWindowPos(hwnd, Some(after), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE)
            .map_err(|_| "Pencere ayarlanamadı (yönetici yetkisiyle çalışıyor olabilir).".to_string())
    }
}

/// Ön plandaki pencerenin üstte tutma durumunu tersine çevirir.
pub fn toggle_foreground(list: &Mutex<Vec<PinnedWindow>>) -> Result<Toggle, String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if is_ignored(hwnd) {
        return Err("Etkin pencere bulunamadı veya üstte tutulamaz.".into());
    }
    let raw = hwnd.0 as isize;
    let info = PinnedWindow {
        hwnd: raw,
        title: window_text(hwnd),
        exe: exe_name_of_hwnd(hwnd).unwrap_or_default(),
    };
    let mut l = list.lock().unwrap_or_else(|e| e.into_inner());
    l.retain(|w| w.hwnd != raw);
    if is_topmost(hwnd) {
        set_topmost(hwnd, false)?;
        Ok(Toggle::Released(info))
    } else {
        set_topmost(hwnd, true)?;
        l.push(info.clone());
        Ok(Toggle::Pinned(info))
    }
}

/// Kapanmış veya artık üstte olmayan pencereleri listeden temizleyip kalanı döndürür.
pub fn list_pinned(list: &Mutex<Vec<PinnedWindow>>) -> Vec<PinnedWindow> {
    let mut l = list.lock().unwrap_or_else(|e| e.into_inner());
    l.retain(|w| {
        let h = hwnd_from_raw(w.hwnd);
        is_alive(h) && is_topmost(h)
    });
    for w in l.iter_mut() {
        let t = window_text(hwnd_from_raw(w.hwnd));
        if !t.is_empty() {
            w.title = t;
        }
    }
    l.clone()
}

pub fn release(list: &Mutex<Vec<PinnedWindow>>, raw: isize) {
    let h = hwnd_from_raw(raw);
    if is_alive(h) {
        let _ = set_topmost(h, false);
    }
    list.lock().unwrap_or_else(|e| e.into_inner()).retain(|w| w.hwnd != raw);
}

pub fn release_all(list: &Mutex<Vec<PinnedWindow>>) {
    let all: Vec<isize> = list.lock().unwrap_or_else(|e| e.into_inner()).iter().map(|w| w.hwnd).collect();
    for raw in all {
        release(list, raw);
    }
}

pub fn cursor_pos() -> Option<(i32, i32)> {
    let mut p = POINT::default();
    unsafe { GetCursorPos(&mut p).ok()? };
    Some((p.x, p.y))
}

/// Pencereyi odağı çalmadan gösterir.
pub fn show_no_activate(raw: isize) {
    unsafe {
        let _ = ShowWindow(hwnd_from_raw(raw), SW_SHOWNOACTIVATE);
    }
}
