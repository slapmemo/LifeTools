/// Panoya kopyalama olayının gizlilikle ilgili meta verileri.
pub struct ClipboardMeta<'a> {
    /// `ExcludeClipboardContentFromMonitorProcessing` biçimi var mı (parola yöneticileri koyar).
    pub exclude_from_monitor: bool,
    /// `CanIncludeInClipboardHistory` DWORD değeri (varsa).
    pub can_include_in_history: Option<u32>,
    /// Pano sahibi pencerenin işlem exe adı (bulunabildiyse).
    pub process: Option<&'a str>,
}

fn base_name(s: &str) -> &str {
    s.rsplit(['\\', '/']).next().unwrap_or(s)
}

/// Saf karar işlevi: true ise öğe kaydedilmemelidir.
pub fn should_skip(meta: &ClipboardMeta, exclusions: &[String]) -> bool {
    if meta.exclude_from_monitor || meta.can_include_in_history == Some(0) {
        return true;
    }
    match meta.process {
        Some(p) if !p.trim().is_empty() => {
            let p = base_name(p.trim());
            exclusions
                .iter()
                .map(|x| base_name(x.trim()))
                .any(|x| !x.is_empty() && x.eq_ignore_ascii_case(p))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta<'a>(ex: bool, can: Option<u32>, p: Option<&'a str>) -> ClipboardMeta<'a> {
        ClipboardMeta { exclude_from_monitor: ex, can_include_in_history: can, process: p }
    }

    #[test]
    fn skips_exclusion_format() {
        assert!(should_skip(&meta(true, None, None), &[]));
    }

    #[test]
    fn skips_history_disabled_only_when_zero() {
        assert!(should_skip(&meta(false, Some(0), None), &[]));
        assert!(!should_skip(&meta(false, Some(1), None), &[]));
        assert!(!should_skip(&meta(false, None, None), &[]));
    }

    #[test]
    fn skips_listed_process_case_insensitive() {
        let ex = vec!["KeePassXC.exe".to_string(), " 1Password.exe ".to_string()];
        assert!(should_skip(&meta(false, None, Some("keepassxc.EXE")), &ex));
        assert!(should_skip(&meta(false, None, Some("C:\\Apps\\1Password.exe")), &ex));
        assert!(!should_skip(&meta(false, None, Some("notepad.exe")), &ex));
        assert!(!should_skip(&meta(false, None, None), &ex));
    }

    #[test]
    fn empty_exclusion_entries_never_match() {
        let ex = vec!["".to_string(), "  ".to_string()];
        assert!(!should_skip(&meta(false, None, Some("a.exe")), &ex));
        assert!(!should_skip(&meta(false, None, Some("")), &ex));
    }
}
