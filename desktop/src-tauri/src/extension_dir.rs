//! Masaüstü uygulamasının güncel tuttuğu, Chrome'a "paketlenmemiş öğe" olarak yüklenen eklenti klasörü.

use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Kopyalanacak toplam boyut üst sınırı.
pub const MAX_COPY_BYTES: u64 = 100 * 1024 * 1024;

/// `%LOCALAPPDATA%\LifeTools\extension`
pub fn target_dir() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")?;
    if !valid_base(Path::new(&base)) {
        return None;
    }
    Some(PathBuf::from(base).join("LifeTools").join("extension"))
}

fn valid_base(base: &Path) -> bool {
    base.is_absolute() && !base.components().any(|c| c == Component::ParentDir)
}

/// Klasördeki manifest.json içindeki `version` değeri.
pub fn read_version(dir: &Path) -> Option<String> {
    let bytes = fs::read(dir.join("manifest.json")).ok()?;
    let text = String::from_utf8_lossy(&bytes);
    let json: serde_json::Value = serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()?;
    json.get("version")?.as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Hedef eksikse ya da sürümü farklıysa eşitleme gerekir.
pub fn needs_sync(target: Option<&str>, bundled: &str) -> bool {
    target != Some(bundled)
}

/// Yalnızca normal dosya ve klasörler kopyalanır; sembolik bağlantı/junction atlanır.
pub fn is_copyable(file_type: &fs::FileType) -> bool {
    !file_type.is_symlink() && (file_type.is_file() || file_type.is_dir())
}

pub fn copy_tree(src: &Path, dst: &Path, remaining: &mut u64) -> io::Result<()> {
    fs::create_dir(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let meta = fs::symlink_metadata(entry.path())?;
        let ft = meta.file_type();
        if !is_copyable(&ft) {
            continue;
        }
        let to = dst.join(entry.file_name());
        if ft.is_dir() {
            copy_tree(&entry.path(), &to, remaining)?;
        } else {
            let size = meta.len();
            if size > *remaining {
                return Err(io::Error::new(io::ErrorKind::InvalidData, "Eklenti klasörü 100 MB sınırını aşıyor"));
            }
            *remaining -= size;
            fs::copy(entry.path(), &to)?;
        }
    }
    Ok(())
}

fn remove_path(path: &Path) -> io::Result<()> {
    let meta = match fs::symlink_metadata(path) {
        Ok(meta) => meta,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(e),
    };
    if meta.file_type().is_symlink() {
        // Windows directory links (including junctions) require remove_dir.
        #[cfg(windows)]
        { return fs::remove_dir(path).or_else(|_| fs::remove_file(path)); }
        #[cfg(not(windows))]
        { return fs::remove_file(path); }
    }
    if meta.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) }
}

fn rollback(old: &Path, target: &Path, had_target: bool) {
    if had_target {
        let _ = fs::rename(old, target);
    }
}

/// `bundled` içeriğini `target` konumuna güvenli biçimde (kopyala → yer değiştir) taşır.
pub fn sync(bundled: &Path, target: &Path) -> Result<(), String> {
    let parent = target.parent().ok_or("Hedef klasör geçersiz")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let name = target.file_name().ok_or("Hedef klasör geçersiz")?.to_string_lossy().into_owned();
    let new = parent.join(format!("{name}.new"));
    let mut old = parent.join(format!("{name}.old"));
    remove_path(&new).map_err(|e| e.to_string())?;
    if remove_path(&old).is_err() {
        let millis = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?.as_millis();
        old = parent.join(format!("{name}.old.{millis}"));
        let mut suffix = 0u64;
        while old.symlink_metadata().is_ok() {
            suffix += 1;
            old = parent.join(format!("{name}.old.{millis}.{suffix}"));
        }
    }
    let had_target = target.symlink_metadata().is_ok();
    let mut budget = MAX_COPY_BYTES;
    if let Err(e) = copy_tree(bundled, &new, &mut budget) {
        let _ = remove_path(&new);
        return Err(e.to_string());
    }
    if had_target {
        if let Err(e) = fs::rename(target, &old) {
            let _ = remove_path(&new);
            return Err(format!("Eklenti klasörü değiştirilemedi: {e}"));
        }
    }
    if let Err(e) = fs::rename(&new, target) {
        rollback(&old, target, had_target);
        let _ = remove_path(&new);
        return Err(format!("Eklenti klasörü değiştirilemedi: {e}"));
    }
    // Kilitliyse bir sonraki başlangıçta temizlenir.
    if had_target { let _ = remove_path(&old); }
    Ok(())
}

/// Uygulama başlangıcında arka planda çalışır.
pub fn spawn_sync(app: AppHandle) {
    std::thread::spawn(move || {
        let Some(target) = target_dir() else { return };
        let Ok(resources) = app.path().resource_dir() else { return };
        let bundled = resources.join("extension");
        let Some(bundled_version) = read_version(&bundled) else { return };
        if !needs_sync(read_version(&target).as_deref(), &bundled_version) {
            // Önceki eşitlemeden kalan .old klasörünü temizle.
            if let (Some(parent), Some(name)) = (target.parent(), target.file_name()) {
                let _ = remove_path(&parent.join(format!("{}.old", name.to_string_lossy())));
            }
            return;
        }
        if let Err(e) = sync(&bundled, &target) {
            eprintln!("Eklenti klasörü eşitlenemedi: {e}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("lifetools-ext-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn sync_decision() {
        assert!(needs_sync(None, "0.5.5"));
        assert!(needs_sync(Some("0.5.4"), "0.5.5"));
        assert!(!needs_sync(Some("0.5.5"), "0.5.5"));
    }

    #[test]
    fn validates_base_path() {
        let absolute = std::env::temp_dir();
        assert!(valid_base(&absolute));
        assert!(!valid_base(Path::new("relative")));
        assert!(!valid_base(&absolute.join("..")));
        assert!(!valid_base(Path::new("")));
    }

    #[test]
    fn first_install_creates_target() {
        let root = temp("first");
        let src = root.join("src");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("manifest.json"), "{}").unwrap();
        let target = root.join("extension");
        sync(&src, &target).unwrap();
        assert!(target.join("manifest.json").is_file());
        assert!(!root.join("extension.old").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn stale_new_is_replaced() {
        let root = temp("stale-new");
        let src = root.join("src");
        fs::create_dir(&src).unwrap();
        fs::write(src.join("fresh"), "ok").unwrap();
        let stale = root.join("extension.new");
        fs::create_dir(&stale).unwrap();
        fs::write(stale.join("stale"), "old").unwrap();
        let target = root.join("extension");
        sync(&src, &target).unwrap();
        assert!(target.join("fresh").is_file());
        assert!(!target.join("stale").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rollback_skips_missing_previous_target() {
        let root = temp("rollback");
        let old = root.join("extension.old");
        let target = root.join("extension");
        fs::create_dir(&old).unwrap();
        rollback(&old, &target, false);
        assert!(old.is_dir());
        assert!(!target.exists());
        rollback(&old, &target, true);
        assert!(target.is_dir());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn reads_version_with_bom() {
        let d = temp("ver");
        fs::write(d.join("manifest.json"), "\u{feff}{\"version\": \"1.2.3\"}").unwrap();
        assert_eq!(read_version(&d).as_deref(), Some("1.2.3"));
        assert_eq!(read_version(&d.join("yok")), None);
        fs::write(d.join("manifest.json"), "{}").unwrap();
        assert_eq!(read_version(&d), None);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn copies_files_and_dirs_and_swaps() {
        let root = temp("swap");
        let src = root.join("src");
        fs::create_dir_all(src.join("icons")).unwrap();
        fs::write(src.join("manifest.json"), "{\"version\":\"2.0.0\"}").unwrap();
        fs::write(src.join("icons").join("a.png"), [1u8, 2, 3]).unwrap();
        let target = root.join("out").join("extension");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("manifest.json"), "{\"version\":\"1.0.0\"}").unwrap();
        fs::write(target.join("stale.txt"), "x").unwrap();
        sync(&src, &target).unwrap();
        assert_eq!(read_version(&target).as_deref(), Some("2.0.0"));
        assert_eq!(fs::read(target.join("icons").join("a.png")).unwrap(), vec![1, 2, 3]);
        assert!(!target.join("stale.txt").exists());
        assert!(!root.join("out").join("extension.new").exists());
        assert!(!root.join("out").join("extension.old").exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn rejects_oversize_copy() {
        let root = temp("big");
        let src = root.join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("a.bin"), vec![0u8; 100]).unwrap();
        let mut budget = 50u64;
        assert!(copy_tree(&src, &root.join("dst"), &mut budget).is_err());
        let mut ok = 100u64;
        assert!(copy_tree(&src, &root.join("dst2"), &mut ok).is_ok());
        assert_eq!(ok, 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn only_regular_files_and_dirs_are_copyable() {
        let d = temp("kind");
        fs::write(d.join("f.txt"), "x").unwrap();
        fs::create_dir_all(d.join("sub")).unwrap();
        let f = fs::symlink_metadata(d.join("f.txt")).unwrap().file_type();
        let s = fs::symlink_metadata(d.join("sub")).unwrap().file_type();
        assert!(is_copyable(&f));
        assert!(is_copyable(&s));
        let _ = fs::remove_dir_all(&d);
    }
}
