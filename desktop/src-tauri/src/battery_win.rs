//! Windows pil bilgisi: sistem durumu ve yerleşik C++ aygıt sürücüleri.
use crate::battery::{self, DeviceBattery};
use serde::Deserialize;
use std::ffi::CStr;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

pub fn read_system() -> Option<DeviceBattery> {
    let mut status = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut status).ok()? };
    battery::parse_system_status(status.BatteryFlag, status.BatteryLifePercent)
}

#[derive(Deserialize)]
struct PolledBattery {
    id: String,
    name: String,
    kind: String,
    percent: Option<u8>,
    charging: bool,
    via: Option<String>,
    detail: Option<String>,
    level_text: Option<String>,
    connected: bool,
    asleep: bool,
    millivolts: Option<i32>,
    grace_sec: u32,
}

#[link(name = "wireless_battery", kind = "static")]
extern "C" {
    fn lifetools_battery_poll_json() -> *const std::ffi::c_char;
}

/// C++ sürücüleri aynı anda çağrılmaya hazır değil (paylaşılan `static` haritalar, aynı aygıta
/// karışan HID istekleri). Ana sayfa özeti, Piller sayfası ve 5 dakikalık zamanlayıcı aynı anda
/// gelebildiği için sorgular bu kilitle sıraya girer.
static POLL_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Yerel C++ sürücü kataloğunu işçi thread'inde sorgular.
pub fn read_supported_devices() -> Vec<DeviceBattery> {
    let _guard = POLL_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let json = unsafe {
        let ptr = lifetools_battery_poll_json();
        if ptr.is_null() { return Vec::new(); }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    };
    drop(_guard);
    let Ok(items) = serde_json::from_str::<Vec<PolledBattery>>(&json) else { return Vec::new() };
    items.into_iter().filter(|item| item.connected).map(|item| DeviceBattery {
        id: item.id,
        name: battery::tr_name(&item.name),
        kind: item.kind,
        percent: item.percent.filter(|p| *p <= 100),
        charging: Some(item.charging),
        via: item.via.filter(|v| !v.is_empty()).map(|v| battery::tr_via(&v)),
        detail: item.detail.filter(|v| !v.is_empty()).map(|v| battery::tr_detail(&v)),
        level_text: item.level_text.filter(|v| !v.is_empty()).map(|v| battery::tr_level(&v)),
        connected: item.connected,
        asleep: item.asleep,
        millivolts: item.millivolts,
        grace_sec: item.grace_sec,
    }).collect()
}

pub fn read_all() -> Vec<DeviceBattery> {
    let mut readings = Vec::new();
    if let Some(system) = read_system() { readings.push(system); }
    readings.extend(read_supported_devices());
    battery::dedupe(readings)
}

#[cfg(test)]
mod tests {
    /// Elle donanım denemesi (bağlı aygıtları gerçekten yoklar):
    /// `cargo test live_wireless -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_wireless() {
        let start = std::time::Instant::now();
        let all = super::read_all();
        for d in &all {
            println!("{} | {} | {:?}% | şarj {:?} | {:?}", d.name, d.kind, d.percent, d.charging, d.via);
        }
        println!("{} aygıt, {} ms", all.len(), start.elapsed().as_millis());
    }
}
