//! Win32 yardımcıları: işlem adı, imleç konumu.
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HWND, POINT};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowThreadProcessId, ShowWindow, SW_SHOWNOACTIVATE,
};

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
