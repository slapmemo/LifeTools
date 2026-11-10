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
    Installed,
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
    crate::toast(app, &format!("LifeTools {} indiriliyor…", update.version));
    let bytes = update.download(|_, _| {}, || {}).await.map_err(|e| {
        let msg = e.to_string();
        crate::toast(app, &format!("Güncelleme başarısız: {msg}"));
        msg
    })?;
    if !manual && crate::video_dl::any_running() {
        return Ok(Outcome::Postponed);
    }
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
    fn check_result_serializes_camel_case() {
        let r = CheckResult { available: true, version: Some("0.5.5".into()), notes: None };
        let v = serde_json::to_value(r).unwrap();
        assert_eq!(v["available"], true);
        assert_eq!(v["version"], "0.5.5");
        assert!(v["notes"].is_null());
    }
}
