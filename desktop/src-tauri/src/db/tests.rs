    use super::*;

    #[test]
    fn backup_preserves_extension_rows_and_shape() {
        let d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT); INSERT INTO meta VALUES('schema_version','3'); CREATE TABLE notes(id INTEGER,text TEXT); INSERT INTO notes VALUES(1,'İstanbul'),(2,'Çay'); CREATE TABLE snippets(id INTEGER,body TEXT); INSERT INTO snippets VALUES(7,'Merhaba'); CREATE TABLE clipboard_items(id INTEGER);").unwrap();
        let backup = backup_data(&d).unwrap();
        let roundtrip: serde_json::Value = serde_json::from_str(&serde_json::to_string(&backup).unwrap()).unwrap();
        assert_eq!(roundtrip["app"], "LifeTools");
        assert_eq!(roundtrip["format"], 1);
        assert_eq!(roundtrip["schema_version"], 3);
        assert!(roundtrip["exported_at"].as_str().unwrap().ends_with('Z'));
        assert_eq!(roundtrip["tables"]["notes"][0]["text"], "İstanbul");
        assert_eq!(roundtrip["tables"]["notes"][1]["text"], "Çay");
        assert_eq!(roundtrip["tables"]["snippets"][0]["body"], "Merhaba");
        assert!(roundtrip["tables"].get("tasks").is_none());
        assert!(roundtrip["tables"].get("clipboard_items").is_none());
        assert_eq!(roundtrip["settings"], serde_json::json!({}));
    }

    fn db() -> Connection {
        let mut d = Connection::open_in_memory().unwrap();
        migrate(&mut d).unwrap();
        d
    }

    fn count(d: &Connection) -> i64 {
        d.query_row("SELECT COUNT(*) FROM clipboard_items", [], |r| r.get(0)).unwrap()
    }

    #[test]
    fn dashboard_handles_missing_extension_tables() {
        let d = db();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert!(!s.notes_available && !s.sites_available);
        assert!(s.notes.is_empty() && s.sites.is_empty());
    }

    #[test]
    fn dashboard_orders_and_limits_shared_data() {
        let d = db();
        d.execute_batch("CREATE TABLE tasks(id INTEGER PRIMARY KEY,title TEXT,due_date TEXT,done_at INTEGER); CREATE TABLE notes(id INTEGER PRIMARY KEY,text TEXT,page_title TEXT,updated_at INTEGER); CREATE TABLE site_time(day TEXT,domain TEXT,seconds INTEGER);").unwrap();
        for i in 1..=7 {
            d.execute("INSERT INTO tasks VALUES(?1,?2,?3,NULL)", params![i, format!("task {i}"), if i == 1 { "2026-11-07" } else { "2026-11-08" }]).unwrap();
            d.execute("INSERT INTO notes VALUES(?1,?2,NULL,?1)", params![i, format!("note {i}\nbody")]).unwrap();
            d.execute("INSERT INTO site_time VALUES('2026-11-08',?1,?2)", params![format!("site{i}"), i]).unwrap();
            insert_clip(&d, &format!("clip {i}"), i, 100).unwrap();
        }
        d.execute("INSERT INTO tasks VALUES(8,'done','2026-11-07',1)", []).unwrap();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert_eq!((s.notes.len(), s.notes[0].id, s.notes[0].title.as_str()), (5, 7, "note 7"));
        assert_eq!((s.sites.len(), s.sites[0].domain.as_str()), (5, "site7"));
        assert_eq!((s.clipboard.len(), s.clipboard[0].preview.as_str()), (3, "clip 7"));
    }

    #[test]
    fn dashboard_site_icons_are_optional_and_filtered() {
        let d = db();
        d.execute_batch("CREATE TABLE site_time(day TEXT,domain TEXT,seconds INTEGER); INSERT INTO site_time VALUES('2026-11-08','x.com',600),('2026-11-08','a.com',300),('2026-11-08','b.com',100);").unwrap();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert!(s.sites.iter().all(|site| site.icon.is_none()));
        assert_eq!(s.sites_total_seconds, 1000);
        d.execute_batch("CREATE TABLE site_icons(domain TEXT PRIMARY KEY,data_url TEXT NOT NULL,updated_at INTEGER NOT NULL); INSERT INTO site_icons VALUES('x.com','data:image/png;base64,AA==',1),('a.com','javascript:alert(1)',1);").unwrap();
        let s = dashboard_summary(&d, "2026-11-08").unwrap();
        assert_eq!(s.sites[0].icon.as_deref(), Some("data:image/png;base64,AA=="));
        assert_eq!((s.sites[1].domain.as_str(), s.sites[1].icon.as_deref()), ("a.com", None));
        assert!(s.sites[2].icon.is_none());
    }

    #[test]
    fn snippets_crud_validation_and_search() {
        let d = db();
        assert_eq!(normalize_trigger("/İ").unwrap(), "/i\u{307}");
        assert!(normalize_trigger("abc").is_err());
        assert!(normalize_trigger("/").is_err());
        assert!(normalize_trigger(&format!("/{}", "a".repeat(32))).is_err());
        let id = save_snippet(&d, None, "/TEST", "İstanbul", "Merhaba").unwrap();
        assert!(save_snippet(&d, None, "/test", "x", "y").is_err());
        assert_eq!(list_snippets(&d, "istanbul").unwrap()[0].id, id);
        save_snippet(&d, Some(id), ";yeni", "Yeni", "İçerik").unwrap();
        assert_eq!(list_snippets(&d, "icerik").unwrap()[0].trigger, ";yeni");
        assert_eq!(delete_snippet(&d, id).unwrap(), 1);
        assert!(list_snippets(&d, "").unwrap().is_empty());
    }

    #[test]
    fn snippet_use_count_lowercase_and_unique_message() {
        let d = db();
        let a = save_snippet(&d, None, "/ÇAY", "Çay", "Demli").unwrap();
        let t: String = d.query_row("SELECT trigger FROM snippets WHERE id=?1", [a], |r| r.get(0)).unwrap();
        assert_eq!(t, "/çay");
        let b = save_snippet(&d, None, ";b", "B", "bb").unwrap();
        assert_eq!(save_snippet(&d, Some(b), "/ÇAY", "B", "bb").unwrap_err(), "Bu tetikleyici zaten kullanılıyor.");
        bump_snippet_use(&d, b).unwrap();
        bump_snippet_use(&d, b).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap()[0].id, b); // çok kullanılan önce
        assert_eq!(get_snippet_body(&d, a).unwrap().as_deref(), Some("Demli"));
        assert_eq!(get_snippet_body(&d, 999).unwrap(), None);
        assert_eq!(list_snippets(&d, "DEMLİ").unwrap().len(), 1);
        assert!(save_snippet(&d, None, "/x", "  ", "y").is_err());
        assert!(save_snippet(&d, Some(999), "/zz", "t", "y").is_err());
    }

    #[test]
    fn ambient_presets_crud_and_validation() {
        let d = db();
        let id = save_preset(&d, " Yağmur ", r#"{"master":0.6,"channels":{"rain":{"on":true,"vol":0.9}}}"#).unwrap();
        let again = save_preset(&d, "Yağmur", r#"{"master":0.3}"#).unwrap();
        assert_eq!(id, again);
        let l = list_presets(&d).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].name, "Yağmur");
        assert!(l[0].config_json.contains("0.3"));
        assert!(save_preset(&d, "", "{}").is_err());
        assert!(save_preset(&d, "x", r#"{"master":5}"#).is_err());
        assert_eq!(list_presets(&d).unwrap().len(), 1);
        assert_eq!(delete_preset(&d, id).unwrap(), 1);
        assert!(list_presets(&d).unwrap().is_empty());
    }

    #[test]
    fn prefs_default_and_roundtrip() {
        let old: Prefs = serde_json::from_str(r#"{"battery_notify":false,"copy_only":true}"#).unwrap();
        assert_eq!(old, Prefs { battery_notify: false, copy_only: true, ..Prefs::default() });
        let d = db();
        assert_eq!(load_prefs(&d).unwrap(), Prefs { battery_notify: true, copy_only: false, picker_shortcut: "Ctrl+Alt+V".into(), snippets_shortcut: "Ctrl+Shift+Space".into(), quicknote_shortcut: "Ctrl+Alt+N".into(), auto_update: true });
        save_prefs(&d, &Prefs { battery_notify: false, copy_only: true, ..Prefs::default() }).unwrap();
        assert_eq!(load_prefs(&d).unwrap(), Prefs { battery_notify: false, copy_only: true, ..Prefs::default() });
    }

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let mut d = Connection::open_in_memory().unwrap();
        assert_eq!(read_version(&d).unwrap(), 0);
        assert_eq!(migrate(&mut d).unwrap(), vec![1, 2, 3, 4, 5]);
        assert_eq!(read_version(&d).unwrap(), 5);
        assert!(migrate(&mut d).unwrap().is_empty());
        let v: String = d
            .query_row("SELECT value FROM meta WHERE key='desktop_schema_version'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "5");
    }

    #[test]
    fn upgrades_legacy_desktop_version_key() {
        let mut d = db();
        d.execute("UPDATE meta SET key='schema_version' WHERE key='desktop_schema_version'", []).unwrap();
        assert!(migrate(&mut d).unwrap().is_empty());
        assert_eq!(read_version(&d).unwrap(), 5);
        let old: i64 = d.query_row("SELECT COUNT(*) FROM meta WHERE key='schema_version'", [], |r| r.get(0)).unwrap();
        assert_eq!(old, 0);
    }

    #[test]
    fn existing_extension_snippets_are_preserved() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL); INSERT INTO snippets VALUES(1,'/a','a','b',0,1,1);").unwrap();
        migrate(&mut d).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
    }

    #[test]
    fn snippet_seconds_are_migrated_to_millis() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); {EXT_SNIPPETS};              INSERT INTO snippets VALUES(1,'/s','S','b',0,1700000000,1700000001), (2,'/m','M','b',0,1700000000000,1700000000000);"
        ))
        .unwrap();
        migrate(&mut d).unwrap();
        let rows: Vec<(i64, i64)> = d
            .prepare("SELECT created_at, updated_at FROM snippets ORDER BY id").unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?))).unwrap()
            .collect::<rusqlite::Result<_>>().unwrap();
        assert_eq!(rows, vec![(1_700_000_000_000, 1_700_000_001_000), (1_700_000_000_000, 1_700_000_000_000)]);
        let id = save_snippet(&d, None, "/yeni", "Y", "b").unwrap();
        let created: i64 = d.query_row("SELECT created_at FROM snippets WHERE id=?1", [id], |r| r.get(0)).unwrap();
        assert!(created > 1_000_000_000_000);
    }

    const EXT_SNIPPETS: &str = "CREATE TABLE IF NOT EXISTS snippets (id INTEGER PRIMARY KEY, trigger TEXT NOT NULL UNIQUE, title TEXT NOT NULL, body TEXT NOT NULL, use_count INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)";

    fn meta_value(d: &Connection, key: &str) -> Option<String> {
        d.query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get(0)).optional().unwrap()
    }

    #[test]
    fn legacy_upgrade_keeps_data_and_moves_version() {
        let mut d = db();
        insert_clip(&d, "eski", 1, 100).unwrap();
        d.execute("UPDATE meta SET key='schema_version' WHERE key='desktop_schema_version'", []).unwrap();
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("5"));
        assert_eq!(meta_value(&d, "schema_version"), None);
        assert_eq!(count(&d), 1);
        // İkinci çalıştırma değişiklik yapmaz.
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("5"));
    }

    #[test]
    fn upgrade_leaves_extension_version_alone_without_desktop_tables() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO meta VALUES('schema_version','8');").unwrap();
        upgrade_version_key(&mut d).unwrap();
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("8"));
        assert_eq!(meta_value(&d, "desktop_schema_version"), None);
    }

    #[test]
    fn shared_db_desktop_first_then_extension() {
        let mut d = Connection::open_in_memory().unwrap();
        migrate(&mut d).unwrap();
        save_snippet(&d, None, "/a", "A", "içerik").unwrap();
        // Eklenti migrasyonları aynı dosyada: snippets IF NOT EXISTS, kendi sürüm anahtarı.
        d.execute_batch(EXT_SNIPPETS).unwrap();
        d.execute("INSERT INTO meta(key,value) VALUES('schema_version','8')", []).unwrap();
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
        assert!(migrate(&mut d).unwrap().is_empty());
        assert_eq!(read_version(&d).unwrap(), 5);
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("8"));
    }

    #[test]
    fn shared_db_extension_first_then_desktop() {
        let mut d = Connection::open_in_memory().unwrap();
        d.execute_batch(&format!(
            "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); {EXT_SNIPPETS}; \
             INSERT INTO snippets VALUES(1,'/e','E','b',0,1,1); INSERT INTO meta VALUES('schema_version','3');"
        ))
        .unwrap();
        assert_eq!(migrate(&mut d).unwrap(), vec![1, 2, 3, 4, 5]);
        assert_eq!(list_snippets(&d, "").unwrap().len(), 1);
        assert_eq!(meta_value(&d, "schema_version").as_deref(), Some("3"));
        assert_eq!(meta_value(&d, "desktop_schema_version").as_deref(), Some("5"));
    }

    #[test]
    fn configure_sets_wal_busy_timeout_and_foreign_keys() {
        let path = std::env::temp_dir().join(format!("lifetools-test-{}-{}.db", std::process::id(), now_secs()));
        {
            let d = open(&path).unwrap();
            let mode: String = d.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
            let busy: i64 = d.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
            let fk: i64 = d.query_row("PRAGMA foreign_keys", [], |r| r.get(0)).unwrap();
            assert_eq!((mode.as_str(), busy, fk), ("wal", 5000, 1));
        }
        for suffix in ["", "-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{}", path.display(), suffix));
        }
    }

    #[test]
    fn failed_migration_rolls_back() {
        let mut d = db();
        let bad = [Migration {
            version: 99,
            statements: &["CREATE TABLE x (a INTEGER)", "THIS IS NOT SQL"],
        }];
        assert!(migrate_with(&mut d, &bad).is_err());
        assert_eq!(read_version(&d).unwrap(), 5);
        let n: i64 = d
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name='x'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn dedupes_only_consecutive_copies() {
        let d = db();
        assert!(insert_clip(&d, "a", 1, 100).unwrap());
        assert!(!insert_clip(&d, "a", 2, 100).unwrap());
        assert!(insert_clip(&d, "b", 3, 100).unwrap());
        assert!(insert_clip(&d, "a", 4, 100).unwrap());
        assert_eq!(count(&d), 3);
    }

    #[test]
    fn rejects_empty_and_oversized() {
        let d = db();
        assert!(!insert_clip(&d, "   ", 1, 100).unwrap());
        assert!(!insert_clip(&d, &"x".repeat(MAX_TEXT_CHARS + 1), 1, 100).unwrap());
        assert!(insert_clip(&d, &"x".repeat(MAX_TEXT_CHARS), 1, 100).unwrap());
    }

    #[test]
    fn max_count_keeps_newest_and_pinned() {
        let d = db();
        insert_clip(&d, "old-pinned", 1, 2).unwrap();
        let id = d.last_insert_rowid();
        set_pinned(&d, id, true).unwrap();
        for (i, t) in ["a", "b", "c", "d"].iter().enumerate() {
            insert_clip(&d, t, 10 + i as i64, 2).unwrap();
        }
        let texts: Vec<String> = list_clips(&d, "").unwrap().into_iter().map(|i| i.text).collect();
        assert_eq!(texts, vec!["old-pinned", "d", "c"]);
    }

    #[test]
    fn expire_removes_old_unpinned_only() {
        let d = db();
        insert_clip(&d, "pinned-old", 100, 100).unwrap();
        set_pinned(&d, d.last_insert_rowid(), true).unwrap();
        insert_clip(&d, "old", 200, 100).unwrap();
        let now = 10 * 86_400;
        insert_clip(&d, "fresh", now - 3600, 100).unwrap();
        assert_eq!(expire_older_than_days(&d, now, 7).unwrap(), 1);
        let texts: Vec<String> = list_clips(&d, "").unwrap().into_iter().map(|i| i.text).collect();
        assert_eq!(texts, vec!["pinned-old", "fresh"]);
        assert_eq!(expire_older_than_days(&d, now, 0).unwrap(), 0);
    }

    #[test]
    fn search_is_turkish_insensitive() {
        let d = db();
        insert_clip(&d, "İstanbul gezisi", 1, 100).unwrap();
        insert_clip(&d, "ısı ölçer", 2, 100).unwrap();
        insert_clip(&d, "başka", 3, 100).unwrap();
        assert_eq!(list_clips(&d, "istanbul").unwrap().len(), 1);
        assert_eq!(list_clips(&d, "ÖLÇER").unwrap().len(), 1);
        assert_eq!(list_clips(&d, "").unwrap().len(), 3);
        assert_eq!(list_clips(&d, "yok").unwrap().len(), 0);
    }

    #[test]
    fn preview_is_truncated_but_full_text_available() {
        let d = db();
        let long = "y".repeat(1000);
        insert_clip(&d, &long, 1, 100).unwrap();
        let items = list_clips(&d, "").unwrap();
        assert!(items[0].truncated);
        assert_eq!(items[0].text.chars().count(), PREVIEW_CHARS);
        assert_eq!(get_clip_text(&d, items[0].id).unwrap().unwrap(), long);
    }

    #[test]
    fn delete_and_clear_unpinned() {
        let d = db();
        insert_clip(&d, "keep", 1, 100).unwrap();
        set_pinned(&d, d.last_insert_rowid(), true).unwrap();
        insert_clip(&d, "x", 2, 100).unwrap();
        let x = d.last_insert_rowid();
        insert_clip(&d, "y", 3, 100).unwrap();
        delete_clip(&d, x).unwrap();
        assert_eq!(count(&d), 2);
        assert_eq!(clear_unpinned(&d).unwrap(), 1);
        assert_eq!(count(&d), 1);
    }

    #[test]
    fn settings_roundtrip_and_sanitize() {
        let d = db();
        assert_eq!(load_settings(&d).unwrap(), Settings::default());
        let saved = save_settings(
            &d,
            Settings {
                paused: true,
                expire_days: 9999,
                max_items: 1,
                exclusions: vec![" a.exe ".into(), "A.EXE".into(), "".into(), "b.exe".into()],
            },
        )
        .unwrap();
        assert_eq!(saved.expire_days, 365);
        assert_eq!(saved.max_items, 10);
        assert_eq!(saved.exclusions, vec!["a.exe", "b.exe"]);
        assert_eq!(load_settings(&d).unwrap(), saved);
    }

    fn notes_db() -> Connection {
        let d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE notes (id INTEGER PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('note','read','watch','idea')), text TEXT NOT NULL, url TEXT, page_title TEXT, user_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
            CREATE VIRTUAL TABLE notes_fts USING fts5(text, user_note, page_title, tokenize = 'unicode61 remove_diacritics 2');
            CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN INSERT INTO notes_fts(rowid, text, user_note, page_title) VALUES (new.id, replace(replace(new.text, 'ı', 'i'), 'İ', 'I'), coalesce(new.user_note, ''), coalesce(new.page_title, '')); END;
            CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN DELETE FROM notes_fts WHERE rowid = old.id; END;
            CREATE TABLE note_pages (note_id INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, text TEXT NOT NULL, saved_at INTEGER NOT NULL);").unwrap();
        d
    }

    fn ls(d: &Connection, category: &str, query: &str) -> Result<NotesPage> {
        list_notes(d, &ListOptions { category, query, archived: false, show_done: true, sort: "new" })
    }

    #[test]
    fn notes_unavailable_until_moved_to_desktop() {
        let d = Connection::open_in_memory().unwrap();
        let page = ls(&d, "", "").unwrap();
        assert!(!page.available);
        assert_eq!(add_note(&d, "note", "Merhaba", None, None).unwrap_err(), NOT_MOVED);
    }

    #[test]
    fn notes_add_list_search_update_delete() {
        let mut d = notes_db();
        let id = add_note(&d, "idea", "  Işık ayarı  ", Some(" "), Some("Çok önemli")).unwrap();
        let other = add_note(&d, "read", "Makale", Some("https://ornek.com"), None).unwrap();
        let note = get_note(&d, id).unwrap().unwrap();
        assert_eq!(note.text, "Işık ayarı");
        assert_eq!(note.url, None);
        assert!(note.created_at > 1_000_000_000_000, "milisaniye olmalı");
        let fts: i64 = d.query_row("SELECT count(*) FROM notes_fts WHERE notes_fts MATCH 'isik'", [], |r| r.get(0)).unwrap();
        assert_eq!(fts, 1, "eklenti araması masaüstünden eklenen notu bulmalı");
        assert_eq!(ls(&d, "", "").unwrap().notes.iter().map(|n| n.id).collect::<Vec<_>>().len(), 2);
        assert_eq!(ls(&d, "read", "").unwrap().notes[0].id, other);
        assert_eq!(ls(&d, "", "işik").unwrap().notes[0].id, id);
        assert_eq!(ls(&d, "", "önemli").unwrap().notes[0].id, id);
        assert!(add_note(&d, "bad", "x", None, None).is_err());
        assert!(add_note(&d, "note", "   ", None, None).is_err());
        update_note(&d, id, "note", "Yeni metin", Some("")).unwrap();
        let note = get_note(&d, id).unwrap().unwrap();
        assert_eq!((note.category.as_str(), note.text.as_str(), note.user_note), ("note", "Yeni metin", None));
        assert!(update_note(&d, 999, "note", "x", None).is_err());
        d.execute("INSERT INTO note_pages VALUES(?1,'sayfa',1)", [id]).unwrap();
        delete_note(&mut d, id).unwrap();
        assert!(get_note(&d, id).unwrap().is_none());
        let pages: i64 = d.query_row("SELECT count(*) FROM note_pages", [], |r| r.get(0)).unwrap();
        assert_eq!(pages, 0);
    }

    #[test]
    fn note_meta_pin_done_archive_reminder_and_counts() {
        let mut d = notes_db();
        let a = add_note(&d, "note", "Birinci #iş", None, None).unwrap();
        let b = add_note(&d, "read", "İkinci", None, None).unwrap();
        let c = add_note(&d, "read", "Üçüncü", None, None).unwrap();
        // Yeni olan önce; sabitlenen en üste çıkar.
        assert_eq!(ls(&d, "", "").unwrap().notes.iter().map(|n| n.id).collect::<Vec<_>>(), vec![c, b, a]);
        set_note_pinned(&d, a, true).unwrap();
        let page = ls(&d, "", "").unwrap();
        assert_eq!(page.notes[0].id, a);
        assert!(page.notes[0].pinned);
        assert_eq!(page.counts, NoteCounts { all: 3, note: 1, read: 2, watch: 0, idea: 0, archived: 0 });
        // Etiket araması metin üzerinden.
        assert_eq!(ls(&d, "", "#iş").unwrap().notes.iter().map(|n| n.id).collect::<Vec<_>>(), vec![a]);
        // Tamamlanan, show_done kapalıyken gizlenir.
        set_note_done(&d, b, true).unwrap();
        let hidden = list_notes(&d, &ListOptions { category: "", query: "", archived: false, show_done: false, sort: "new" }).unwrap();
        assert!(hidden.notes.iter().all(|n| n.id != b));
        assert!(get_note(&d, b).unwrap().unwrap().done_at.is_some());
        set_note_done(&d, b, false).unwrap();
        assert!(get_note(&d, b).unwrap().unwrap().done_at.is_none());
        // Arşiv ayrı görünümde, sayılara girmez.
        set_note_archived(&d, c, true).unwrap();
        assert!(ls(&d, "", "").unwrap().notes.iter().all(|n| n.id != c));
        let arch = list_notes(&d, &ListOptions { category: "", query: "", archived: true, show_done: true, sort: "new" }).unwrap();
        assert_eq!(arch.notes.iter().map(|n| n.id).collect::<Vec<_>>(), vec![c]);
        assert_eq!((arch.counts.all, arch.counts.read, arch.counts.archived), (2, 1, 1));
        // Eski önce sıralaması.
        let old = list_notes(&d, &ListOptions { category: "", query: "", archived: false, show_done: true, sort: "old" }).unwrap();
        assert_eq!(old.notes.iter().map(|n| n.id).collect::<Vec<_>>(), vec![a, b]);
        // Hatırlatma bir kez bildirilir; yeni zaman verilince yeniden.
        set_note_reminder(&d, b, Some(1_000)).unwrap();
        assert_eq!(take_due_reminders(&d, 999).unwrap(), vec![]);
        assert_eq!(take_due_reminders(&d, 1_000).unwrap(), vec![(b, "İkinci".to_string())]);
        assert_eq!(take_due_reminders(&d, 2_000).unwrap(), vec![]);
        set_note_reminder(&d, b, Some(3_000)).unwrap();
        assert_eq!(take_due_reminders(&d, 3_000).unwrap().len(), 1);
        set_note_reminder(&d, b, None).unwrap();
        assert!(get_note(&d, b).unwrap().unwrap().remind_at.is_none());
        assert!(set_note_pinned(&d, 999, true).is_err());
        // Kategori ve yalnız metin güncelleme.
        set_note_category(&d, a, "idea").unwrap();
        update_note_text(&d, a, "- [x] bitti").unwrap();
        let n = get_note(&d, a).unwrap().unwrap();
        assert_eq!((n.category.as_str(), n.text.as_str()), ("idea", "- [x] bitti"));
        // Sayfa ekleri ve silmede meta temizliği.
        d.execute("INSERT INTO note_pages VALUES(?1,'sayfa metni',5)", [a]).unwrap();
        assert!(get_note(&d, a).unwrap().unwrap().has_page);
        assert_eq!(note_page(&d, a).unwrap().unwrap().text, "sayfa metni");
        assert!(note_image(&d, a).unwrap().is_none());
        delete_note(&mut d, a).unwrap();
        let metas: i64 = d.query_row("SELECT count(*) FROM note_meta WHERE note_id=?1", [a], |r| r.get(0)).unwrap();
        assert_eq!(metas, 0);
    }

    fn watch_db() -> Connection {
        let d = Connection::open_in_memory().unwrap();
        d.execute_batch("CREATE TABLE watch_items (id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('film','dizi','video','diger')), status TEXT NOT NULL DEFAULT 'izlenecek' CHECK(status IN ('izlenecek','izleniyor','bitti')), url TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)").unwrap();
        d
    }

    #[test]
    fn watch_unavailable_until_moved() {
        let d = Connection::open_in_memory().unwrap();
        assert!(!list_watch(&d, "", "", "").unwrap().available);
        assert_eq!(add_watch(&d, "Film", "film", None, None).unwrap_err(), NOT_MOVED_WATCH);
    }

    #[test]
    fn watch_add_list_filter_update_status_delete() {
        let d = watch_db();
        let a = add_watch(&d, "  Yüzüklerin Efendisi ", "film", Some(" "), Some("uzun sürüm")).unwrap();
        let b = add_watch(&d, "Dark", "dizi", Some("https://ornek.com/dark"), None).unwrap();
        let item = get_watch(&d, a).unwrap().unwrap();
        assert_eq!((item.title.as_str(), item.status.as_str(), item.url.clone()), ("Yüzüklerin Efendisi", "izlenecek", None));
        assert!(item.created_at > 1_000_000_000_000, "milisaniye olmalı");
        assert_eq!(list_watch(&d, "", "", "").unwrap().items.len(), 2);
        assert_eq!(list_watch(&d, "", "dizi", "").unwrap().items[0].id, b);
        assert_eq!(list_watch(&d, "", "", "yuzuk").unwrap().items[0].id, a, "Türkçe harfsiz arama da bulur");
        assert_eq!(list_watch(&d, "", "", "yüzük").unwrap().items[0].id, a);
        assert_eq!(list_watch(&d, "", "", "SÜRÜM").unwrap().items[0].id, a);
        set_watch_status(&d, a, "izleniyor").unwrap();
        let page = list_watch(&d, "izleniyor", "", "").unwrap();
        assert_eq!(page.items.iter().map(|i| i.id).collect::<Vec<_>>(), vec![a]);
        assert_eq!(page.counts, WatchCounts { all: 2, izlenecek: 1, izleniyor: 1, bitti: 0 });
        assert!(set_watch_status(&d, a, "kotu").is_err());
        assert!(add_watch(&d, "x", "kitap", None, None).is_err());
        assert!(add_watch(&d, "   ", "film", None, None).is_err());
        assert!(add_watch(&d, "x", "film", Some("ftp://a"), None).is_err());
        update_watch(&d, b, "Dark (2017)", "dizi", None, Some("3 sezon")).unwrap();
        let updated = get_watch(&d, b).unwrap().unwrap();
        assert_eq!((updated.title.as_str(), updated.url.clone(), updated.note.as_deref()), ("Dark (2017)", None, Some("3 sezon")));
        assert!(update_watch(&d, 999, "x", "film", None, None).is_err());
        delete_watch(&d, a).unwrap();
        assert!(get_watch(&d, a).unwrap().is_none());
    }
