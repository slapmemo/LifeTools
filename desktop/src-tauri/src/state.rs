use crate::win::PinnedWindow;
use rusqlite::Connection;
use std::sync::atomic::AtomicU64;
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

pub struct AppState {
    db: Mutex<Connection>,
    /// Bu uygulamanın üstte tuttuğu pencereler.
    pub pinned: Mutex<Vec<PinnedWindow>>,
    /// Geçmişten panoya geri kopyalanan metin; dinleyici bunu yeniden eklemez.
    pub suppress: Mutex<Option<(String, Instant)>>,
    pub toast_gen: AtomicU64,
}

impl AppState {
    pub fn new(conn: Connection) -> Self {
        AppState {
            db: Mutex::new(conn),
            pinned: Mutex::new(Vec::new()),
            suppress: Mutex::new(None),
            toast_gen: AtomicU64::new(0),
        }
    }

    pub fn db(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }
}
