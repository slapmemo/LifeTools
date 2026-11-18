use std::{fs, path::{Path, PathBuf}};

fn main() {
    ensure_icon();
    compile_wireless_battery();
    // `frontendDist` yolu derleme sırasında mevcut olmalı (npm run build henüz çalışmamış olabilir).
    let _ = fs::create_dir_all("../dist");
    tauri_build::build()
}

fn compile_wireless_battery() {
    let root = Path::new("vendor/wireless-battery/src");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut sources = Vec::new();
    collect_cpp(root, &mut sources);
    sources.sort();

    let mut build = cc::Build::new();
    // Tanımlar üst kaynağın kendi derlemesiyle aynı (Makefile / build.bat): WIN32_LEAN_AND_MEAN yok,
    // çünkü sürücüler <windows.h> üzerinden gelen COM yardımcılarını (ör. StringFromGUID2) kullanıyor.
    build.cpp(true).std("c++17").define("UNICODE", None).define("_UNICODE", None)
        .define("_WIN32_WINNT", "0x0A00").define("WINVER", "0x0A00").define("NOMINMAX", None)
        // xinput.cpp MinGW'nin WinRT adını kullanıyor; Windows SDK'da (MSVC) aynı tip `__FIReference_1_int`.
        .define("__FIReference_1_INT32", "__FIReference_1_int")
        // /Zc:lambda: üst kaynak GCC ile derleniyor; constexpr yerelleri yakalamadan kullanan lambdalar
        // (ör. razer_headset.cpp) MSVC'nin eski lambda işlemcisinde C3493 verir.
        .include(root).flag_if_supported("/EHsc").flag_if_supported("/Zc:lambda").warnings(false);
    for source in sources {
        println!("cargo:rerun-if-changed={}", source.display());
        build.file(source);
    }
    build.compile("wireless_battery");

    for library in ["hid", "setupapi", "cfgmgr32", "advapi32", "ole32", "oleaut32", "runtimeobject", "ws2_32", "user32"] {
        println!("cargo:rustc-link-lib={library}");
    }
}

fn collect_cpp(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            // Üst kaynağın Linux arka ucu (hidraw) Windows'ta derlenmez.
            if path.file_name().is_some_and(|name| name == "linux") { continue; }
            collect_cpp(&path, files);
        } else if path.extension().is_some_and(|ext| ext == "cpp")
            // main/widget/report: üst kaynağın kendi tepsi uygulaması ve "destek iste" penceresi (ağ isteği yapar);
            // headsetcontrol: dışarıdan exe çalıştırır. LifeTools bunları kullanmaz.
            && !matches!(path.file_name().and_then(|name| name.to_str()), Some("main.cpp" | "widget.cpp" | "report.cpp" | "headsetcontrol.cpp")) {
            files.push(path);
        }
    }
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
