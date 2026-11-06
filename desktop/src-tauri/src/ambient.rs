//! Ortam sesi ön ayarlarının doğrulanması (sesler arayüzde Web Audio ile üretilir).
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const CHANNELS: [&str; 6] = ["white", "pink", "brown", "rain", "fan", "wave"];
pub const MAX_JSON_BYTES: usize = 4096;
pub const MAX_NAME_CHARS: usize = 40;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Channel {
    pub on: bool,
    pub vol: f64,
}

impl Default for Channel {
    fn default() -> Self {
        Channel { on: false, vol: 0.5 }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Config {
    pub master: f64,
    pub channels: BTreeMap<String, Channel>,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            master: 0.8,
            channels: CHANNELS.iter().map(|c| (c.to_string(), Channel::default())).collect(),
        }
    }
}

fn unit(v: f64) -> bool {
    v.is_finite() && (0.0..=1.0).contains(&v)
}

/// Ayar JSON'unu doğrular; eksik kanalları varsayılanla doldurup normalleştirilmiş JSON döndürür.
pub fn sanitize_config(json: &str) -> Result<String, String> {
    if json.len() > MAX_JSON_BYTES {
        return Err("Ayar verisi çok büyük.".into());
    }
    let mut cfg: Config = serde_json::from_str(json).map_err(|_| "Ayar verisi geçersiz.".to_string())?;
    if !unit(cfg.master) {
        return Err("Ana ses düzeyi 0 ile 1 arasında olmalı.".into());
    }
    for (name, ch) in &cfg.channels {
        if !CHANNELS.contains(&name.as_str()) {
            return Err(format!("Bilinmeyen kanal: {name}"));
        }
        if !unit(ch.vol) {
            return Err("Kanal ses düzeyi 0 ile 1 arasında olmalı.".into());
        }
    }
    for c in CHANNELS {
        cfg.channels.entry(c.to_string()).or_default();
    }
    serde_json::to_string(&cfg).map_err(|e| e.to_string())
}

pub fn validate_name(name: &str) -> Result<String, String> {
    let n = name.trim();
    if n.is_empty() {
        return Err("Ön ayar adı gerekli.".into());
    }
    if n.chars().count() > MAX_NAME_CHARS || n.chars().any(|c| c.is_control()) {
        return Err("Ön ayar adı en fazla 40 karakter olmalı.".into());
    }
    Ok(n.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fills_missing_channels() {
        let out = sanitize_config(r#"{"master":0.5,"channels":{"rain":{"on":true,"vol":0.7}}}"#).unwrap();
        let c: Config = serde_json::from_str(&out).unwrap();
        assert_eq!(c.channels.len(), 6);
        assert_eq!(c.channels["rain"], Channel { on: true, vol: 0.7 });
        assert!(!c.channels["fan"].on);
        assert_eq!(c.master, 0.5);
    }

    #[test]
    fn empty_object_gives_defaults() {
        let c: Config = serde_json::from_str(&sanitize_config("{}").unwrap()).unwrap();
        assert_eq!(c, Config::default());
    }

    #[test]
    fn rejects_bad_values() {
        assert!(sanitize_config(r#"{"master":1.5}"#).is_err());
        assert!(sanitize_config(r#"{"master":-0.1}"#).is_err());
        assert!(sanitize_config(r#"{"channels":{"rain":{"vol":2}}}"#).is_err());
        assert!(sanitize_config(r#"{"channels":{"thunder":{"on":true}}}"#).is_err());
        assert!(sanitize_config("not json").is_err());
        assert!(sanitize_config(&format!(r#"{{"x":"{}"}}"#, "a".repeat(MAX_JSON_BYTES))).is_err());
    }

    #[test]
    fn name_validation() {
        assert_eq!(validate_name("  Yağmurlu gece ").unwrap(), "Yağmurlu gece");
        assert!(validate_name("   ").is_err());
        assert!(validate_name(&"a".repeat(41)).is_err());
        assert!(validate_name("a\nb").is_err());
        assert!(validate_name(&"ş".repeat(40)).is_ok());
    }
}
