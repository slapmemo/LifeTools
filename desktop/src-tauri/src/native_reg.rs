//! Chrome Native Messaging ana bilgisayar kaydı: manifest dosyası + HKCU kayıt defteri anahtarı.

use crate::db;
use crate::native_host::{ALLOWED_ORIGIN, HOST_NAME};
use serde::Serialize;
use serde_json::json;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyW, RegDeleteKeyW, RegGetValueW, RegSetValueExW, HKEY, HKEY_CURRENT_USER,
    REG_SZ, RRF_RT_REG_SZ,
};

const REG_SUBKEY: &str = r"Software\Google\Chrome\NativeMessagingHosts\com.mehmet.lifetools";

#[derive(Serialize, Debug, PartialEq)]
pub struct Status {
    /// Kayıt defteri anahtarı var, manifest dosyasına işaret ediyor ve dosya mevcut.
    pub registered: bool,
    /// Manifestteki `path` bu çalışan exe ile aynı.
    pub path_matches: bool,
    pub manifest_path: String,
    pub exe_path: String,
    pub registered_exe: Option<String>,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn manifest_path() -> Result<PathBuf, String> {
    Ok(db::default_path()?.with_file_name(format!("{HOST_NAME}.json")))
}

pub fn manifest_json(exe: &Path) -> String {
    serde_json::to_string_pretty(&json!({
        "name": HOST_NAME,
        "description": "LifeTools masaüstü köprüsü",
        "path": exe.to_string_lossy(),
        "type": "stdio",
        "allowed_origins": [ALLOWED_ORIGIN],
    }))
    .unwrap_or_default()
}

/// Saf durum değerlendirmesi: (registered, path_matches, registered_exe).
pub fn evaluate(reg_value: Option<&str>, manifest_text: Option<&str>, manifest_path: &str, exe: &str) -> (bool, bool, Option<String>) {
    let registered_exe = manifest_text
        .and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok())
        .and_then(|v| v.get("path").and_then(|p| p.as_str().map(str::to_string)));
    let registered = manifest_text.is_some()
        && registered_exe.is_some()
        && reg_value.map(|r| r.eq_ignore_ascii_case(manifest_path)).unwrap_or(false);
    let matches = registered && registered_exe.as_deref().map(|p| p.eq_ignore_ascii_case(exe)).unwrap_or(false);
    (registered, matches, registered_exe)
}

fn read_registry() -> Option<String> {
    let sub = wide(REG_SUBKEY);
    unsafe {
        let mut size: u32 = 0;
        let r = RegGetValueW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()), PCWSTR::null(), RRF_RT_REG_SZ, None, None, Some(&mut size));
        if r != ERROR_SUCCESS || size == 0 {
            return None;
        }
        let mut buf = vec![0u16; size as usize / 2 + 1];
        let mut size2 = (buf.len() * 2) as u32;
        let r = RegGetValueW(
            HKEY_CURRENT_USER,
            PCWSTR(sub.as_ptr()),
            PCWSTR::null(),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr() as *mut c_void),
            Some(&mut size2),
        );
        if r != ERROR_SUCCESS {
            return None;
        }
        buf.truncate(size2 as usize / 2);
        while buf.last() == Some(&0) {
            buf.pop();
        }
        Some(String::from_utf16_lossy(&buf))
    }
}

fn write_registry(manifest: &str) -> Result<(), String> {
    let sub = wide(REG_SUBKEY);
    let value = wide(manifest);
    unsafe {
        let mut key = HKEY::default();
        RegCreateKeyW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()), &mut key)
            .ok()
        .map_err(|e| e.to_string())?;
        let bytes = std::slice::from_raw_parts(value.as_ptr() as *const u8, value.len() * 2);
        let r = RegSetValueExW(key, PCWSTR::null(), None, REG_SZ, Some(bytes));
        let _ = RegCloseKey(key);
        r.ok().map_err(|e| e.to_string())
    }
}

fn delete_registry() -> Result<(), String> {
    let sub = wide(REG_SUBKEY);
    unsafe {
        let r = RegDeleteKeyW(HKEY_CURRENT_USER, PCWSTR(sub.as_ptr()));
        if r != ERROR_SUCCESS && r != ERROR_FILE_NOT_FOUND {
            return Err(format!("Kayıt defteri anahtarı silinemedi ({})", r.0));
        }
    }
    Ok(())
}

pub fn status() -> Result<Status, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?.to_string_lossy().into_owned();
    let mp = manifest_path()?;
    let mp_str = mp.to_string_lossy().into_owned();
    let text = std::fs::read_to_string(&mp).ok();
    let (registered, path_matches, registered_exe) = evaluate(read_registry().as_deref(), text.as_deref(), &mp_str, &exe);
    Ok(Status { registered, path_matches, manifest_path: mp_str, exe_path: exe, registered_exe })
}

pub fn register() -> Result<Status, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mp = manifest_path()?;
    std::fs::write(&mp, manifest_json(&exe)).map_err(|e| format!("Manifest yazılamadı: {e}"))?;
    write_registry(&mp.to_string_lossy())?;
    status()
}

pub fn unregister() -> Result<Status, String> {
    delete_registry()?;
    let mp = manifest_path()?;
    match std::fs::remove_file(&mp) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("Manifest silinemedi: {e}")),
    }
    status()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_has_required_fields() {
        let text = manifest_json(Path::new(r"C:\Program Files\LifeTools\lifetools.exe"));
        let v: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["name"], "com.mehmet.lifetools");
        assert_eq!(v["type"], "stdio");
        assert_eq!(v["path"], r"C:\Program Files\LifeTools\lifetools.exe");
        assert_eq!(v["allowed_origins"], json!([ALLOWED_ORIGIN]));
    }

    #[test]
    fn status_evaluation() {
        let mp = r"C:\Users\x\AppData\Roaming\LifeTools\com.mehmet.lifetools.json";
        let text = manifest_json(Path::new(r"C:\app\LifeTools.exe"));
        assert_eq!(evaluate(Some(mp), Some(&text), mp, r"c:\APP\lifetools.exe"), (true, true, Some(r"C:\app\LifeTools.exe".to_string())));
        assert_eq!(evaluate(Some(mp), Some(&text), mp, r"C:\other.exe").0, true);
        assert_eq!(evaluate(Some(mp), Some(&text), mp, r"C:\other.exe").1, false);
        assert_eq!(evaluate(None, Some(&text), mp, "x").0, false);
        assert_eq!(evaluate(Some(mp), None, mp, "x").0, false);
        assert_eq!(evaluate(Some(r"C:\baska.json"), Some(&text), mp, "x").0, false);
        assert_eq!(evaluate(Some(mp), Some("bozuk"), mp, "x").0, false);
    }
}
