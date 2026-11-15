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

/// USB alıcılı ATK/Compx fareler: üretici HID arayüzüne pil sorgusu gönderir (yalnız okuma).
/// Fare kapalı ya da uykudaysa cevap gelmez; zaman aşımında atlanır.
pub fn read_wireless() -> Vec<DeviceBattery> {
    use windows::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiEnumDeviceInterfaces, SetupDiGetDeviceInterfaceDetailW, DIGCF_DEVICEINTERFACE,
        SP_DEVICE_INTERFACE_DATA, SP_DEVICE_INTERFACE_DETAIL_DATA_W,
    };
    use windows::Win32::Devices::HumanInterfaceDevice::HidD_GetHidGuid;
    let mut out = Vec::new();
    unsafe {
        let guid = HidD_GetHidGuid();
        let Ok(set) = SetupDiGetClassDevsW(Some(&guid), PCWSTR::null(), None, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE) else {
            return out;
        };
        let mut i = 0u32;
        loop {
            let mut iface = SP_DEVICE_INTERFACE_DATA { cbSize: std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32, ..Default::default() };
            if SetupDiEnumDeviceInterfaces(set, None, &guid, i, &mut iface).is_err() {
                break;
            }
            i += 1;
            let mut need = 0u32;
            let _ = SetupDiGetDeviceInterfaceDetailW(set, &iface, None, 0, Some(&mut need), None);
            if need < 8 || need > 4096 {
                continue;
            }
            // u32 dizisi: yapının hizalaması için.
            let mut buf = vec![0u32; (need as usize).div_ceil(4)];
            let detail = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
            (*detail).cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
            if SetupDiGetDeviceInterfaceDetailW(set, &iface, Some(detail), need, None, None).is_err() {
                continue;
            }
            let path = PCWSTR((*detail).DevicePath.as_ptr());
            let Ok(text) = path.to_string() else { continue };
            let lower = text.to_ascii_lowercase();
            if !lower.contains(&format!("vid_{:04x}", battery::ATK_VENDOR_ID)) {
                continue;
            }
            if let Some(b) = query_atk(path, &lower) {
                out.push(b);
            }
        }
        let _ = SetupDiDestroyDeviceInfoList(set);
    }
    battery::dedupe(out)
}

/// Tek bir HID arayüzünü açar; üretici arayüzüyse pil sorgusunu gönderip cevabı bekler.
unsafe fn query_atk(path: PCWSTR, lower_path: &str) -> Option<DeviceBattery> {
    use windows::Win32::Devices::HumanInterfaceDevice::{
        HidD_FreePreparsedData, HidD_GetPreparsedData, HidD_GetProductString, HidP_GetCaps, HIDP_CAPS, PHIDP_PREPARSED_DATA,
    };
    use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE, WAIT_OBJECT_0};
    use windows::Win32::Storage::FileSystem::{CreateFileW, ReadFile, WriteFile, FILE_FLAG_OVERLAPPED, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING};
    use windows::Win32::System::IO::{CancelIo, GetOverlappedResult, OVERLAPPED};
    use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};

    let handle: HANDLE = CreateFileW(path, (GENERIC_READ | GENERIC_WRITE).0, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None).ok()?;
    struct Guard(HANDLE);
    impl Drop for Guard { fn drop(&mut self) { unsafe { let _ = CloseHandle(self.0); } } }
    let _guard = Guard(handle);

    let mut pre = PHIDP_PREPARSED_DATA::default();
    if !HidD_GetPreparsedData(handle, &mut pre) {
        return None;
    }
    let mut caps = HIDP_CAPS::default();
    let caps_ok = HidP_GetCaps(pre, &mut caps).is_ok();
    let _ = HidD_FreePreparsedData(pre);
    if !caps_ok || caps.UsagePage != battery::ATK_USAGE_PAGE
        || caps.InputReportByteLength as usize != battery::ATK_REPORT_LEN
        || caps.OutputReportByteLength as usize != battery::ATK_REPORT_LEN {
        return None;
    }

    let event = CreateEventW(None, true, false, PCWSTR::null()).ok()?;
    let _event_guard = Guard(event);
    let wait = |ov: &mut OVERLAPPED, ms: u32| -> Option<u32> {
        if WaitForSingleObject(event, ms) != WAIT_OBJECT_0 {
            let _ = CancelIo(handle);
            return None;
        }
        let mut n = 0u32;
        GetOverlappedResult(handle, ov, &mut n, false).ok()?;
        Some(n)
    };

    let req = battery::atk_battery_request();
    let mut ov = OVERLAPPED { hEvent: event, ..Default::default() };
    let _ = WriteFile(handle, Some(&req), None, Some(&mut ov));
    wait(&mut ov, 300)?;

    // Alıcı arada başka raporlar da gönderebilir; birkaçına bak, toplam ~600 ms.
    let deadline = std::time::Instant::now() + std::time::Duration::from_millis(600);
    let mut resp = [0u8; battery::ATK_REPORT_LEN];
    let found = loop {
        let left = deadline.saturating_duration_since(std::time::Instant::now()).as_millis() as u32;
        if left == 0 { break None; }
        let mut ov = OVERLAPPED { hEvent: event, ..Default::default() };
        let _ = ReadFile(handle, Some(&mut resp), None, Some(&mut ov));
        let Some(n) = wait(&mut ov, left) else { break None };
        if let Some(v) = battery::parse_atk_battery(&resp[..n as usize]) { break Some(v); }
    };
    let (percent, charging) = found?;

    let mut name_buf = [0u16; 128];
    let name = if HidD_GetProductString(handle, name_buf.as_mut_ptr() as *mut _, (name_buf.len() * 2) as u32) {
        let end = name_buf.iter().position(|c| *c == 0).unwrap_or(name_buf.len());
        String::from_utf16_lossy(&name_buf[..end]).trim().to_string()
    } else { String::new() };
    // Alıcılar genelde "... Mouse Dongle" gibi genel bir ad bildirir.
    let name = if name.is_empty() || name.to_ascii_lowercase().contains("mouse") { "Kablosuz fare".to_string() } else { name };
    // Aynı alıcının farklı arayüzleri tek kayıt: VID/PID kimliği.
    let id = lower_path.split('#').nth(1).and_then(|s| s.split('&').take(2).collect::<Vec<_>>().join("&").into()).unwrap_or_default();
    Some(battery::wireless_device(&id, &name, percent, charging))
}

pub fn read_all() -> Vec<DeviceBattery> {
    let mut v = Vec::new();
    if let Some(s) = read_system() {
        v.push(s);
    }
    v.extend(read_bluetooth());
    v.extend(read_wireless());
    v
}

#[cfg(test)]
mod tests {
    /// Gerçek donanımla elle: `cargo test live_wireless -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn live_wireless() {
        let t = std::time::Instant::now();
        println!("{:?} ({} ms)", super::read_wireless(), t.elapsed().as_millis());
    }
}
