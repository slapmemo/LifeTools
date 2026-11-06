use crate::battery::NotifyTracker;
use crate::win::PinnedWindow;
use rusqlite::Connection;
use std::sync::atomic::{AtomicIsize, AtomicU64};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

const PROGRAMMATIC_TTL: Duration = Duration::from_secs(6);

pub struct AppState {
    db: Mutex<Connection>,
    /// Bu uygulamanın üstte tuttuğu pencereler.
    pub pinned: Mutex<Vec<PinnedWindow>>,
    /// Geçmişten panoya geri kopyalanan metin; dinleyici bunu yeniden eklemez.
    pub suppress: Mutex<Option<(String, Instant)>>,
    pub toast_gen: AtomicU64,
    /// Şablon seçici açılmadan önceki ön plan penceresi (0 = yok).
    pub snippet_target: AtomicIsize,
    /// Uygulamanın kendi yazdığı pano metinleri (şablon ekleme); geçmişe kaydedilmez.
    programmatic: Mutex<Vec<(String, Instant)>>,
    pub tracker: Mutex<NotifyTracker>,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Mutex::new(conn),
            pinned: Mutex::new(Vec::new()),
            suppress: Mutex::new(None),
            toast_gen: AtomicU64::new(0),
            snippet_target: AtomicIsize::new(0),
            programmatic: Mutex::new(Vec::new()),
            tracker: Mutex::new(NotifyTracker::default()),
        }
    }

    pub fn db(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn mark_programmatic(&self, text: &str) {
        let mut v = self.programmatic.lock().unwrap_or_else(|e| e.into_inner());
        v.retain(|(_, at)| at.elapsed() < PROGRAMMATIC_TTL);
        v.push((text.to_string(), Instant::now()));
    }

    pub fn is_programmatic(&self, text: &str) -> bool {
        let mut v = self.programmatic.lock().unwrap_or_else(|e| e.into_inner());
        v.retain(|(_, at)| at.elapsed() < PROGRAMMATIC_TTL);
        v.iter().any(|(t, _)| t == text)
    }
}
