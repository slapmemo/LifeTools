//! Pil verisi için tüm Win32 erişimi burada: GetSystemPowerStatus + SetupAPI aygıt özellikleri.
use crate::battery::{self, DeviceBattery};
use windows::core::{GUID, PCWSTR};
use windows::Win32::Devices::DeviceAndDriverInstallation::{
    SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, SetupDiGetDevicePropertyW,
    DIGCF_ALLCLASSES, DIGCF_PRESENT, HDEVINFO, SP_DEVINFO_DATA,
};
use windows::Win32::Foundation::DEVPROPKEY;
use windows::Win32::Devices::Properties::DEVPROPTYPE;
use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

/// Bluetooth pil düzeyi: {104EA319-6EE2-4701-BD47-8DDBF425BBE5}, 2
const BATTERY_KEY: DEVPROPKEY =
    DEVPROPKEY { fmtid: GUID::from_u128(0x104EA319_6EE2_4701_BD47_8DDBF425BBE5), pid: 2 };
/// DEVPKEY_Device_FriendlyName
const FRIENDLY_KEY: DEVPROPKEY =
    DEVPROPKEY { fmtid: GUID::from_u128(0xA45C254E_DF1C_4EFD_8020_67D146A850E0), pid: 14 };
/// DEVPKEY_NAME
const NAME_KEY: DEVPROPKEY =
    DEVPROPKEY { fmtid: GUID::from_u128(0xB725F130_47EF_101A_A5F1_02608C9EEBAC), pid: 10 };

const DEVPROP_TYPE_BYTE: u32 = 0x03;
const DEVPROP_TYPE_STRING: u32 = 0x12;

pub fn read_system() -> Option<DeviceBattery> {
    let mut st = SYSTEM_POWER_STATUS::default();
    unsafe { GetSystemPowerStatus(&mut st).ok()? };
    battery::parse_system_status(st.BatteryFlag, st.BatteryLifePercent)
}

unsafe fn prop(set: HDEVINFO, data: &SP_DEVINFO_DATA, key: &DEVPROPKEY) -> Option<(u32, Vec<u8>)> {
    let mut ty = DEVPROPTYPE(0);
    let mut need = 0u32;
    let mut buf = vec![0u8; 1024];
    SetupDiGetDevicePropertyW(set, data, key, &mut ty, Some(&mut buf[..]), Some(&mut need as *mut u32), 0).ok()?;
    buf.truncate((need as usize).min(1024));
    Some((ty.0, buf))
}

pub fn read_bluetooth() -> Vec<DeviceBattery> {
    let mut out = Vec::new();
    unsafe {
        let Ok(set) = SetupDiGetClassDevsW(None, PCWSTR::null(), None, DIGCF_ALLCLASSES | DIGCF_PRESENT) else {
            return out;
        };
        let mut i = 0u32;
        loop {
            let mut data = SP_DEVINFO_DATA {
                cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };
            if SetupDiEnumDeviceInfo(set, i, &mut data).is_err() {
                break;
            }
            i += 1;
            let Some((ty, raw)) = prop(set, &data, &BATTERY_KEY) else { continue };
            if ty != DEVPROP_TYPE_BYTE {
                continue;
            }
            let Some(percent) = battery::parse_bt_level(&raw) else { continue };
            let name = [&FRIENDLY_KEY, &NAME_KEY]
                .iter()
                .filter_map(|k| prop(set, &data, k))
                .filter(|(t, _)| *t == DEVPROP_TYPE_STRING)
                .find_map(|(_, b)| battery::parse_utf16_name(&b))
                .unwrap_or_else(|| "Bluetooth aygıtı".to_string());
            out.push(battery::bluetooth_device(&name, percent));
        }
        let _ = SetupDiDestroyDeviceInfoList(set);
    }
    battery::dedupe(out)
}

pub fn read_all() -> Vec<DeviceBattery> {
    let mut v = Vec::new();
    if let Some(s) = read_system() {
        v.push(s);
    }
    v.extend(read_bluetooth());
    v
}
