//! İmzalı otomatik güncelleme (tauri-plugin-updater). Yalnızca uygulama modunda çalışır.

use crate::db;
use crate::state::AppState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::UpdaterExt;

const FIRST_CHECK_DELAY: Duration = Duration::from_secs(30);
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const POSTPONE_INTERVAL: Duration = Duration::from_secs(10 * 60);
/// Aynı sürümün kurulumu denendikten sonra hâlâ eski sürümdeysek, otomatik deneme bu süre bekler.
const RETRY_SAME_VERSION_SECS: i64 = 12 * 60 * 60;
const ATTEMPT_KEY: &str = "update_attempt";

static BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    UpToDate,
    Postponed,
    /// Bu sürüm kısa süre önce denendi ve kurulamadı; döngüye girmemek için atlandı.
    Skipped,
}

struct BusyGuard;
impl BusyGuard {
    fn acquire() -> Option<BusyGuard> {
        BUSY.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| BusyGuard)
    }
}
impl Drop for BusyGuard {
    fn drop(&mut self) {
        BUSY.store(false, Ordering::SeqCst);
    }
}

/// Son otomatik kurulum denemesi: aynı sürüm `RETRY_SAME_VERSION_SECS` içinde tekrar denenmez.
/// (Kurulum başarılı olsaydı uygulama zaten yeni sürümle açılırdı.)
pub fn should_skip(last_attempt: Option<&str>, version: &str, now_secs: i64) -> bool {
    let Some((v, at)) = last_attempt.and_then(|s| s.split_once('|')) else { return false };
    let Ok(at) = at.parse::<i64>() else { return false };
    v == version && now_secs >= at && now_secs - at < RETRY_SAME_VERSION_SECS
}

/// Yükleyicinin kenara aldığı kilitli eski exe kopyalarını siler (windows/hooks.nsh).
/// Hâlâ çalışan bir kopya (ör. Chrome'un native host'u) silinemez; bir sonraki açılışta denenir.
pub fn cleanup_old_binaries() {
    let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())) else { return };
    let Ok(entries) = std::fs::read_dir(&dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
        if name.starts_with("lifetools-desktop.old") && name.ends_with(".exe") {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// Yeni sürüm varsa bekleme süresi; aksi halde normal aralık.
pub fn next_wait(outcome: &Result<Outcome, String>) -> Duration {
    match outcome {
        Ok(Outcome::Postponed) => POSTPONE_INTERVAL,
        _ => CHECK_INTERVAL,
    }
}

async fn find_update(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())
}

/// Yalnızca denetler; indirmez.
pub async fn check_info(app: &AppHandle) -> Result<CheckResult, String> {
    Ok(match find_update(app).await? {
        Some(u) => CheckResult { available: true, version: Some(u.version.clone()), notes: u.body.clone() },
        None => CheckResult { available: false, version: None, notes: None },
    })
}

pub async fn check_and_install(app: &AppHandle, manual: bool) -> Result<Outcome, String> {
    let Some(_guard) = BusyGuard::acquire() else {
        return if manual { Err("Güncelleme zaten denetleniyor veya indiriliyor.".into()) } else { Ok(Outcome::Postponed) };
    };
    let update = match find_update(app).await {
        Ok(u) => u,
        Err(e) => {
            if manual {
                crate::toast(app, &format!("Güncelleme başarısız: {e}"));
            }
            return Err(e);
        }
    };
    let Some(update) = update else {
        if manual {
            crate::toast(app, &format!("LifeTools güncel (v{})", app.package_info().version));
        }
        return Ok(Outcome::UpToDate);
    };
    if !manual && crate::video_dl::any_running() {
        return Ok(Outcome::Postponed);
    }
    let state = app.state::<Arc<AppState>>();
    if !manual {
        let last = db::get_setting(&state.db(), ATTEMPT_KEY).ok().flatten();
        if should_skip(last.as_deref(), &update.version, db::now_secs()) {
            return Ok(Outcome::Skipped);
        }
    }
    crate::toast(app, &format!("LifeTools {} indiriliyor…", update.version));
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| {
        let msg = e.to_string();
        crate::toast(app, &format!("Güncelleme başarısız: {msg}"));
        msg
    })?;
    if !manual && crate::video_dl::any_running() {
        return Ok(Outcome::Postponed);
    }
    let _ = db::set_setting(&state.db(), ATTEMPT_KEY, &format!("{}|{}", update.version, db::now_secs()));
    update.install(&bytes).map_err(|e| {
        let msg = e.to_string();
        crate::toast(app, &format!("Güncelleme başarısız: {msg}"));
        msg
    })?;
    app.restart();
}

fn auto_enabled(app: &AppHandle) -> bool {
    let state = app.state::<Arc<AppState>>();
    let db = state.db();
    db::load_prefs(&db).map(|p| p.auto_update).unwrap_or(true)
}

/// 30 sn sonra, sonra 6 saatte bir arka planda denetler.
pub fn spawn_auto(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            let mut wait = CHECK_INTERVAL;
            if auto_enabled(&app) {
                let result = tauri::async_runtime::block_on(check_and_install(&app, false));
                if let Err(e) = &result {
                    eprintln!("Güncelleme denetlenemedi: {e}");
                }
                wait = next_wait(&result);
            }
            std::thread::sleep(wait);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn postponed_retries_sooner() {
        assert_eq!(next_wait(&Ok(Outcome::Postponed)), Duration::from_secs(600));
        assert_eq!(next_wait(&Ok(Outcome::UpToDate)), Duration::from_secs(6 * 3600));
        assert_eq!(next_wait(&Err("x".into())), Duration::from_secs(6 * 3600));
    }

    #[test]
    fn same_version_is_not_retried_for_12_hours() {
        let now = 1_000_000;
        assert!(!should_skip(None, "0.5.9", now));
        assert!(should_skip(Some("0.5.9|999000"), "0.5.9", now));
        assert!(!should_skip(Some("0.5.9|900000"), "0.5.9", now), "12 saat geçti");
        assert!(!should_skip(Some("0.5.8|999000"), "0.5.9", now), "daha yeni sürüm hemen denenir");
        assert!(!should_skip(Some("bozuk"), "0.5.9", now));
        assert!(!should_skip(Some("0.5.9|2000000"), "0.5.9", now), "gelecekteki zaman yok sayılır");
        assert_eq!(next_wait(&Ok(Outcome::Skipped)), Duration::from_secs(6 * 3600));
    }

    #[test]
    fn check_result_serializes_camel_case() {
        let r = CheckResult { available: true, version: Some("0.5.5".into()), notes: None };
        let v = serde_json::to_value(r).unwrap();
        assert_eq!(v["available"], true);
        assert_eq!(v["version"], "0.5.5");
        assert!(v["notes"].is_null());
    }
}
