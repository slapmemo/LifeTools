//! Pil verisi: saf ayrıştırma, biçimlendirme ve eşik bildirimi kararı (Win32 erişimi `battery_win.rs`'te).
use serde::Serialize;
use std::collections::HashSet;

pub const LOW_THRESHOLD: u8 = 20;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DeviceBattery {
    pub id: String,
    pub name: String,
    /// "system" | "bluetooth" | "wireless" (USB alıcılı)
    pub kind: String,
    pub percent: u8,
    /// Yalnızca Windows bildiriyorsa dolu (sistem pili).
    pub charging: Option<bool>,
}

/// `SYSTEM_POWER_STATUS` alanlarından sistem pili. Pil yoksa/bilinmiyorsa None.
pub fn parse_system_status(battery_flag: u8, percent: u8) -> Option<DeviceBattery> {
    // 128 = pil yok, 255 = bilinmiyor
    if battery_flag == 255 || battery_flag & 128 != 0 || percent > 100 {
        return None;
    }
    Some(DeviceBattery {
        id: "system".into(),
        name: "Sistem pili".into(),
        kind: "system".into(),
        percent,
        charging: Some(battery_flag & 8 != 0),
    })
}

/// Bluetooth pil düzeyi özelliği (DEVPROP_TYPE_BYTE) ham baytları; 0–100 dışı geçersizdir.
pub fn parse_bt_level(raw: &[u8]) -> Option<u8> {
    match raw.first() {
        Some(&v) if v <= 100 => Some(v),
        _ => None,
    }
}

/// UTF-16LE DEVPROP_TYPE_STRING baytlarını metne çevirir (sondaki NUL kırpılır).
pub fn parse_utf16_name(raw: &[u8]) -> Option<String> {
    let units: Vec<u16> = raw.chunks_exact(2).map(|b| u16::from_le_bytes([b[0], b[1]])).collect();
    let s = String::from_utf16_lossy(&units);
    let s = s.trim_end_matches('\0').trim();
    if s.is_empty() { None } else { Some(s.to_string()) }
}

pub fn bluetooth_device(name: &str, percent: u8) -> DeviceBattery {
    DeviceBattery {
        id: format!("bt:{name}"),
        name: name.to_string(),
        kind: "bluetooth".into(),
        percent,
        charging: None,
    }
}

// ---------- USB alıcılı ATK/Compx (VID 0x373B) fareler ----------
// Üretici sürücüsünün HID protokolü (topluluk çalışması: github.com/cyberphantom52/libatk-rs).
// Rapor 0x08, 17 bayt: [rapor, komut, durum, adres(2), veri uzunluğu, veri(10), sağlama].
// Sağlama = 0x55 - (ilk 16 baytın toplamı). Komut 0x04 = pil düzeyini oku (yalnız okuma).

pub const ATK_VENDOR_ID: u16 = 0x373B;
pub const ATK_USAGE_PAGE: u16 = 0xFF02;
pub const ATK_REPORT_ID: u8 = 0x08;
pub const ATK_REPORT_LEN: usize = 17;
const ATK_CMD_BATTERY: u8 = 0x04;

fn atk_checksum(bytes: &[u8]) -> u8 {
    0x55u8.wrapping_sub(bytes.iter().fold(0u8, |acc, b| acc.wrapping_add(*b)))
}

/// Pil sorgusu raporu.
pub fn atk_battery_request() -> [u8; ATK_REPORT_LEN] {
    let mut r = [0u8; ATK_REPORT_LEN];
    r[0] = ATK_REPORT_ID;
    r[1] = ATK_CMD_BATTERY;
    r[ATK_REPORT_LEN - 1] = atk_checksum(&r[..ATK_REPORT_LEN - 1]);
    r
}

/// Pil cevabını çözer: (yüzde, şarj oluyor mu). Başka bir rapor, bozuk sağlama ya da
/// fare çevrim dışıyken (veri yok) None.
pub fn parse_atk_battery(resp: &[u8]) -> Option<(u8, bool)> {
    if resp.len() < ATK_REPORT_LEN || resp[0] != ATK_REPORT_ID || resp[1] != ATK_CMD_BATTERY { return None; }
    if atk_checksum(&resp[..ATK_REPORT_LEN - 1]) != resp[ATK_REPORT_LEN - 1] { return None; }
    if resp[5] < 1 { return None; }
    let percent = resp[6];
    if percent > 100 { return None; }
    let charging = resp[5] >= 2 && resp[7] != 0;
    Some((percent, charging))
}

pub fn wireless_device(id: &str, name: &str, percent: u8, charging: bool) -> DeviceBattery {
    DeviceBattery { id: format!("usb:{id}"), name: name.to_string(), kind: "wireless".into(), percent, charging: Some(charging) }
}

/// Aynı aygıt birden çok düğüm olarak görünebilir; ada göre ilk kayıt tutulur.
pub fn dedupe(list: Vec<DeviceBattery>) -> Vec<DeviceBattery> {
    let mut seen = HashSet::new();
    list.into_iter().filter(|d| seen.insert(d.id.clone())).collect()
}

/// Tepsi ipucu metni (Windows sınırı ~127 karakter).
pub fn tooltip_text(list: &[DeviceBattery]) -> String {
    let mut s = format!("LifeTools {}", env!("CARGO_PKG_VERSION"));
    for d in list {
        let line = format!("\n{}: %{}", d.name, d.percent);
        if s.chars().count() + line.chars().count() > 120 {
            s.push_str("\n…");
            break;
        }
        s.push_str(&line);
    }
    s
}

/// Eşiğin altına düşüşte aygıt başına bir kez bildirim kararı verir.
#[derive(Default)]
pub struct NotifyTracker {
    low: HashSet<String>,
}

impl NotifyTracker {
    /// Bildirilmesi gereken aygıtları döndürür. Şarj oluyorsa veya eşik üstüne çıkmışsa durum sıfırlanır.
    pub fn update(&mut self, list: &[DeviceBattery], threshold: u8) -> Vec<DeviceBattery> {
        let mut out = Vec::new();
        for d in list {
            let below = d.percent < threshold && d.charging != Some(true);
            if below {
                if self.low.insert(d.id.clone()) {
                    out.push(d.clone());
                }
            } else {
                self.low.remove(&d.id);
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dev(id: &str, p: u8, charging: Option<bool>) -> DeviceBattery {
        DeviceBattery { id: id.into(), name: id.into(), kind: "bluetooth".into(), percent: p, charging }
    }

    #[test]
    fn system_status_parsing() {
        assert!(parse_system_status(128, 100).is_none()); // pil yok
        assert!(parse_system_status(255, 50).is_none()); // bilinmiyor
        assert!(parse_system_status(1, 255).is_none()); // yüzde bilinmiyor
        let d = parse_system_status(1, 85).unwrap();
        assert_eq!((d.percent, d.charging), (85, Some(false)));
        assert_eq!(parse_system_status(9, 40).unwrap().charging, Some(true));
    }

    #[test]
    fn bt_level_parsing() {
        assert_eq!(parse_bt_level(&[73]), Some(73));
        assert_eq!(parse_bt_level(&[0]), Some(0));
        assert_eq!(parse_bt_level(&[101]), None);
        assert_eq!(parse_bt_level(&[]), None);
    }

    #[test]
    fn utf16_names() {
        let raw: Vec<u8> = "Kulaklık\0".encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
        assert_eq!(parse_utf16_name(&raw).as_deref(), Some("Kulaklık"));
        assert_eq!(parse_utf16_name(&[0, 0]), None);
    }

    #[test]
    fn dedupes_by_id() {
        let l = dedupe(vec![bluetooth_device("A", 50), bluetooth_device("B", 60), bluetooth_device("A", 50)]);
        assert_eq!(l.len(), 2);
    }

    #[test]
    fn tooltip_format_and_limit() {
        assert_eq!(tooltip_text(&[]), format!("LifeTools {}", env!("CARGO_PKG_VERSION")));
        let t = tooltip_text(&[dev("Fare", 85, None)]);
        assert_eq!(t, format!("LifeTools {}\nFare: %85", env!("CARGO_PKG_VERSION")));
        let many: Vec<_> = (0..30).map(|i| dev(&format!("Aygıt {i}"), 50, None)).collect();
        assert!(tooltip_text(&many).chars().count() <= 124);
    }

    #[test]
    fn notifies_once_per_drop() {
        let mut t = NotifyTracker::default();
        assert!(t.update(&[dev("a", 50, None)], 20).is_empty());
        assert_eq!(t.update(&[dev("a", 19, None)], 20).len(), 1);
        assert!(t.update(&[dev("a", 15, None)], 20).is_empty()); // tekrar yok
        assert!(t.update(&[dev("a", 20, None)], 20).is_empty()); // eşik dahil değil, sıfırlanır
        assert_eq!(t.update(&[dev("a", 10, None)], 20).len(), 1); // yeni düşüş
    }

    #[test]
    fn charging_does_not_notify_and_resets() {
        let mut t = NotifyTracker::default();
        assert!(t.update(&[dev("a", 10, Some(true))], 20).is_empty());
        assert_eq!(t.update(&[dev("a", 10, Some(false))], 20).len(), 1);
        assert!(t.update(&[dev("a", 10, Some(true))], 20).is_empty());
        assert_eq!(t.update(&[dev("a", 10, Some(false))], 20).len(), 1);
    }

    #[test]
    fn atk_request_and_real_response() {
        assert_eq!(atk_battery_request(), [0x08, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49]);
        // ATK A9 Plus'tan gelen gerçek cevap (%90, şarj olmuyor).
        let real = [0x08, 0x04, 0x00, 0x00, 0x00, 0x02, 0x5a, 0x00, 0x0f, 0xbe, 0, 0, 0, 0, 0, 0, 0x20];
        assert_eq!(parse_atk_battery(&real), Some((90, false)));
        let mut charging = real; charging[7] = 1; charging[16] = charging[16].wrapping_sub(1);
        assert_eq!(parse_atk_battery(&charging), Some((90, true)));
        let mut bad = real; bad[16] ^= 1;
        assert_eq!(parse_atk_battery(&bad), None, "bozuk sağlama");
        let mut other = real; other[1] = 0x03; other[16] = other[16].wrapping_add(1);
        assert_eq!(parse_atk_battery(&other), None, "başka komut");
        let mut offline = real; offline[5] = 0; offline[16] = offline[16].wrapping_add(2);
        assert_eq!(parse_atk_battery(&offline), None, "veri yok");
        assert_eq!(parse_atk_battery(&real[..10]), None);
    }
}
