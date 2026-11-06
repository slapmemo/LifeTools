use std::{fs, path::Path};

fn main() {
    ensure_icon();
    // `frontendDist` yolu derleme sırasında mevcut olmalı (npm run build henüz çalışmamış olabilir).
    let _ = fs::create_dir_all("../dist");
    tauri_build::build()
}

/// `icons/icon.ico` yoksa basit bir 32x32 simge üretir (Windows kaynak dosyası için gerekli).
fn ensure_icon() {
    let path = Path::new("icons/icon.ico");
    if path.exists() {
        return;
    }
    let _ = fs::create_dir_all("icons");
    let n = 32usize;
    let img_size = 40 + n * n * 4 + n * 4;
    let mut d: Vec<u8> = Vec::new();
    d.extend([0u8, 0, 1, 0, 1, 0]);
    d.extend([n as u8, n as u8, 0, 0, 1, 0, 32, 0]);
    d.extend((img_size as u32).to_le_bytes());
    d.extend(22u32.to_le_bytes());
    d.extend(40u32.to_le_bytes());
    d.extend((n as i32).to_le_bytes());
    d.extend(((2 * n) as i32).to_le_bytes());
    d.extend(1u16.to_le_bytes());
    d.extend(32u16.to_le_bytes());
    d.extend(0u32.to_le_bytes());
    d.extend(((n * n * 4) as u32).to_le_bytes());
    d.extend([0u8; 16]);
    for y in (0..n).rev() {
        for x in 0..n {
            let inside = (2..30).contains(&x) && (2..30).contains(&y);
            let letter = ((9..13).contains(&x) && (7..25).contains(&y))
                || ((21..25).contains(&y) && (9..23).contains(&x));
            let px: [u8; 4] = if !inside {
                [0, 0, 0, 0]
            } else if letter {
                [255, 255, 255, 255]
            } else {
                [0xF6, 0x82, 0x3B, 255]
            };
            d.extend(px);
        }
    }
    d.extend(vec![0u8; n * 4]);
    let _ = fs::write(path, d);
}
