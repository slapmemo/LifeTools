//! Pil verisi biçimlendirme ve eşik bildirimi kararları.
use serde::Serialize;
use std::collections::HashSet;

pub const LOW_THRESHOLD: u8 = 20;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DeviceBattery {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub percent: Option<u8>,
    pub charging: Option<bool>,
    pub via: Option<String>,
    pub detail: Option<String>,
    pub level_text: Option<String>,
    pub connected: bool,
    pub asleep: bool,
    pub millivolts: Option<i32>,
    pub grace_sec: u32,
}

impl DeviceBattery {
    pub fn from_percent(id: String, name: String, kind: String, percent: u8, charging: Option<bool>) -> Self {
        Self {
            id, name, kind, percent: Some(percent), charging, via: None, detail: None,
            level_text: None, connected: true, asleep: false, millivolts: None, grace_sec: 0,
        }
    }
}

/// `SYSTEM_POWER_STATUS` alanlarından sistem pili. Pil yoksa/bilinmiyorsa None.
pub fn parse_system_status(battery_flag: u8, percent: u8) -> Option<DeviceBattery> {
    if battery_flag == 255 || battery_flag & 128 != 0 || percent > 100 {
        return None;
    }
    Some(DeviceBattery::from_percent(
        "system".into(), "Sistem pili".into(), "system".into(), percent, Some(battery_flag & 8 != 0),
    ))
}

// ---- Gömülü C++ sürücülerinin İngilizce metinleri (vendor/wireless-battery) ----
// Kütüphanenin kendisine dokunulmaz (GPL kaynağı aynen kalsın, güncellemesi kolay olsun); metinler burada çevrilir.

/// Bağlantı yolu: "2.4 GHz receiver" → "2.4 GHz alıcı", AirPods ayrıntısı "Bluetooth · L 60%  R 55%  case 40%" dahil.
pub fn tr_via(text: &str) -> String {
    const PAIRS: [(&str, &str); 15] = [
        ("2.4 GHz receiver or USB", "2.4 GHz alıcı ya da USB"),
        ("2.4 GHz dongle or USB", "2.4 GHz alıcı ya da USB"),
        ("2.4 GHz receiver", "2.4 GHz alıcı"),
        ("2.4 GHz dongle", "2.4 GHz alıcı"),
        ("USB cable", "USB kablosu"),
        ("UWB base station", "UWB baz istasyonu"),
        ("USB base station", "USB baz istasyonu"),
        ("Base station", "Baz istasyonu"),
        ("Wireless adapter", "Kablosuz adaptör"),
        ("BT600 adapter", "BT600 adaptörü"),
        ("Jabra Link dongle", "Jabra Link alıcısı"),
        (" receiver", " alıcısı"),
        ("\u{00B7} L ", "\u{00B7} Sol "),
        ("  R ", "  Sağ "),
        ("  case ", "  kutu "),
    ];
    PAIRS.iter().fold(text.to_string(), |s, (from, to)| s.replace(from, to))
}

/// Kulaklık ayrıntısı: "L 60%, R 55%, case 40%" → "Sol 60%, Sağ 55%, kutu 40%".
pub fn tr_detail(text: &str) -> String {
    let s = text.strip_prefix("L ").map(|rest| format!("Sol {rest}")).unwrap_or_else(|| text.to_string());
    s.replace(", R ", ", Sağ ").replace(", case ", ", kutu ")
}

/// Yüzde bildirmeyen aygıtların seviyesi.
pub fn tr_level(text: &str) -> String {
    match text {
        "Full" => "Dolu", "Good" => "İyi", "Medium" => "Orta", "Low" => "Düşük", "Critical" => "Kritik", "Empty" => "Boş",
        other => other,
    }.to_string()
}

/// Adı bilinmeyen aygıtların yedek adı.
pub fn tr_name(text: &str) -> String {
    match text {
        "Wireless device" => "Kablosuz aygıt", "Bluetooth device" => "Bluetooth aygıtı",
        other => other,
    }.to_string()
}

/// Aynı aygıt birden çok düğüm olarak görünürse kimliğe göre tek kayıt tutar.
pub fn dedupe(list: Vec<DeviceBattery>) -> Vec<DeviceBattery> {
    let mut seen = HashSet::new();
    list.into_iter().filter(|d| seen.insert(d.id.clone())).collect()
}

/// Tepsi ipucu metni (Windows sınırı ~127 karakter).
pub fn tooltip_text(list: &[DeviceBattery]) -> String {
    let mut s = format!("LifeTools {}", env!("CARGO_PKG_VERSION"));
    for d in list {
        let level = d.percent.map(|p| format!("%{p}"))
            .or_else(|| d.level_text.clone()).unwrap_or_else(|| "bilinmiyor".into());
        let line = format!("\n{}: {level}", d.name);
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
    /// Şarj olurken veya eşik üstünde durum sıfırlanır.
    pub fn update(&mut self, list: &[DeviceBattery], threshold: u8) -> Vec<DeviceBattery> {
        let mut out = Vec::new();
        for d in list {
            // Uykudaki aygıt seviye bildirmez; durumu bilinmeyen aygıt için önceki "düşük" kaydı korunur,
            // yoksa uyanınca aynı uyarı yeniden çıkar.
            let Some(percent) = d.percent else { continue };
            let below = percent < threshold && d.charging != Some(true);
            if below {
                if self.low.insert(d.id.clone()) { out.push(d.clone()); }
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
        DeviceBattery::from_percent(id.into(), id.into(), "bluetooth".into(), p, charging)
    }

    #[test]
    fn system_status_parsing() {
        assert!(parse_system_status(128, 100).is_none());
        assert!(parse_system_status(255, 50).is_none());
        assert!(parse_system_status(1, 255).is_none());
        let d = parse_system_status(1, 85).unwrap();
        assert_eq!((d.percent, d.charging), (Some(85), Some(false)));
        assert_eq!(parse_system_status(9, 40).unwrap().charging, Some(true));
    }

    #[test]
    fn dedupes_by_id() {
        assert_eq!(dedupe(vec![dev("a", 50, None), dev("b", 60, None), dev("a", 50, None)]).len(), 2);
    }

    #[test]
    fn tooltip_format_and_limit() {
        assert_eq!(tooltip_text(&[]), format!("LifeTools {}", env!("CARGO_PKG_VERSION")));
        assert_eq!(tooltip_text(&[dev("Mouse", 85, None)]), format!("LifeTools {}\nMouse: %85", env!("CARGO_PKG_VERSION")));
        let many: Vec<_> = (0..30).map(|i| dev(&format!("Device {i}"), 50, None)).collect();
        assert!(tooltip_text(&many).chars().count() <= 124);
    }

    #[test]
    fn notifies_once_per_drop() {
        let mut tracker = NotifyTracker::default();
        assert!(tracker.update(&[dev("a", 50, None)], 20).is_empty());
        assert_eq!(tracker.update(&[dev("a", 19, None)], 20).len(), 1);
        assert!(tracker.update(&[dev("a", 15, None)], 20).is_empty());
        assert!(tracker.update(&[dev("a", 20, None)], 20).is_empty());
        assert_eq!(tracker.update(&[dev("a", 10, None)], 20).len(), 1);
    }

    #[test]
    fn library_texts_are_turkish() {
        assert_eq!(tr_via("2.4 GHz receiver"), "2.4 GHz alıcı");
        assert_eq!(tr_via("2.4 GHz receiver or USB"), "2.4 GHz alıcı ya da USB");
        assert_eq!(tr_via("USB cable"), "USB kablosu");
        assert_eq!(tr_via("2.4 GHz dongle or USB"), "2.4 GHz alıcı ya da USB");
        assert_eq!(tr_via("2.4 GHz receiver / USB"), "2.4 GHz alıcı / USB");
        assert_eq!(tr_via("USB base station"), "USB baz istasyonu");
        assert_eq!(tr_via("Base station"), "Baz istasyonu");
        assert_eq!(tr_via("Wireless adapter"), "Kablosuz adaptör");
        assert_eq!(tr_via("BT600 adapter"), "BT600 adaptörü");
        assert_eq!(tr_via("Logitech receiver"), "Logitech alıcısı");
        assert_eq!(tr_via("Bluetooth"), "Bluetooth");
        assert_eq!(tr_via("Bluetooth \u{00B7} L 60%\u{26A1}  R 55%  case 40%"), "Bluetooth \u{00B7} Sol 60%\u{26A1}  Sağ 55%  kutu 40%");
        assert_eq!(tr_detail("L 60%, R 55%, case 40%"), "Sol 60%, Sağ 55%, kutu 40%");
        assert_eq!(tr_level("Critical"), "Kritik");
        assert_eq!(tr_level("bilinmeyen"), "bilinmeyen");
        assert_eq!(tr_name("Wireless device"), "Kablosuz aygıt");
        assert_eq!(tr_name("Nearlink Mouse"), "Nearlink Mouse");
    }

    #[test]
    fn unknown_level_keeps_low_state() {
        let mut tracker = NotifyTracker::default();
        assert_eq!(tracker.update(&[dev("a", 15, None)], 20).len(), 1);
        let mut asleep = dev("a", 15, None);
        asleep.percent = None;
        assert!(tracker.update(&[asleep], 20).is_empty());
        assert!(tracker.update(&[dev("a", 14, None)], 20).is_empty());
    }

    #[test]
    fn charging_does_not_notify_and_resets() {
        let mut tracker = NotifyTracker::default();
        assert!(tracker.update(&[dev("a", 10, Some(true))], 20).is_empty());
        assert_eq!(tracker.update(&[dev("a", 10, Some(false))], 20).len(), 1);
        assert!(tracker.update(&[dev("a", 10, Some(true))], 20).is_empty());
        assert_eq!(tracker.update(&[dev("a", 10, Some(false))], 20).len(), 1);
    }
}
