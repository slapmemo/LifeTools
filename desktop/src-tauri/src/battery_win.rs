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

/// Yerel C++ sürücü kataloğunu işçi thread'inde sorgular.
pub fn read_supported_devices() -> Vec<DeviceBattery> {
    let json = unsafe {
        let ptr = lifetools_battery_poll_json();
        if ptr.is_null() { return Vec::new(); }
        CStr::from_ptr(ptr).to_string_lossy().into_owned()
    };
    let Ok(items) = serde_json::from_str::<Vec<PolledBattery>>(&json) else { return Vec::new() };
    items.into_iter().filter(|item| item.connected).map(|item| DeviceBattery {
        id: item.id,
        name: item.name,
        kind: item.kind,
        percent: item.percent.filter(|p| *p <= 100),
        charging: Some(item.charging),
        via: item.via.filter(|v| !v.is_empty()),
        detail: item.detail.filter(|v| !v.is_empty()),
        level_text: item.level_text.filter(|v| !v.is_empty()),
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
