use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Component {
    pub name: String,
    pub watts: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct Electricity {
    pub components: Vec<Component>,
    pub hours: f64,
    /// TL/kWh; kullanıcı girene kadar boş.
    pub price: Option<f64>,
}

impl Default for Electricity {
    fn default() -> Self {
        let c = |n: &str, w: f64| Component { name: n.to_string(), watts: w };
        Electricity {
            components: vec![c("CPU", 65.0), c("GPU", 150.0), c("Monitör", 30.0), c("Diğer", 20.0)],
            hours: 8.0,
            price: None,
        }
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Estimate {
    pub daily_kwh: f64,
    pub monthly_kwh: f64,
    pub yearly_kwh: f64,
    pub daily_tl: f64,
    pub monthly_tl: f64,
    pub yearly_tl: f64,
}

/// Ay = 30 gün, yıl = 365 gün. Fiyat girilmemişse hata döner.
pub fn estimate(e: &Electricity) -> Result<Estimate, String> {
    let price = e.price.ok_or_else(|| "Birim fiyatı (TL/kWh) girilmeden TL hesaplanamaz.".to_string())?;
    if !price.is_finite() || price < 0.0 {
        return Err("Birim fiyat geçersiz.".into());
    }
    if !e.hours.is_finite() || !(0.0..=24.0).contains(&e.hours) {
        return Err("Günlük kullanım süresi 0 ile 24 saat arasında olmalı.".into());
    }
    if e.components.iter().any(|c| !c.watts.is_finite() || c.watts < 0.0) {
        return Err("Watt değerleri negatif olamaz.".into());
    }
    let daily = e.components.iter().map(|c| c.watts).sum::<f64>() * e.hours / 1000.0;
    Ok(Estimate {
        daily_kwh: daily,
        monthly_kwh: daily * 30.0,
        yearly_kwh: daily * 365.0,
        daily_tl: daily * price,
        monthly_tl: daily * 30.0 * price,
        yearly_tl: daily * 365.0 * price,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(price: Option<f64>) -> Electricity {
        Electricity {
            components: vec![
                Component { name: "CPU".into(), watts: 100.0 },
                Component { name: "GPU".into(), watts: 200.0 },
            ],
            hours: 10.0,
            price,
        }
    }

    #[test]
    fn computes_kwh_and_tl() {
        let r = estimate(&sample(Some(2.0))).unwrap();
        assert!((r.daily_kwh - 3.0).abs() < 1e-9);
        assert!((r.monthly_kwh - 90.0).abs() < 1e-9);
        assert!((r.yearly_kwh - 1095.0).abs() < 1e-9);
        assert!((r.daily_tl - 6.0).abs() < 1e-9);
        assert!((r.monthly_tl - 180.0).abs() < 1e-9);
        assert!((r.yearly_tl - 2190.0).abs() < 1e-9);
    }

    #[test]
    fn requires_price() {
        assert!(estimate(&sample(None)).is_err());
        assert!(estimate(&Electricity::default()).is_err());
    }

    #[test]
    fn rejects_invalid_values() {
        assert!(estimate(&sample(Some(-1.0))).is_err());
        let mut e = sample(Some(1.0));
        e.hours = 25.0;
        assert!(estimate(&e).is_err());
        let mut e = sample(Some(1.0));
        e.components[0].watts = -5.0;
        assert!(estimate(&e).is_err());
        let mut e = sample(Some(1.0));
        e.hours = f64::NAN;
        assert!(estimate(&e).is_err());
    }

    #[test]
    fn zero_hours_is_zero() {
        let mut e = sample(Some(3.0));
        e.hours = 0.0;
        assert_eq!(estimate(&e).unwrap().yearly_tl, 0.0);
    }
}
