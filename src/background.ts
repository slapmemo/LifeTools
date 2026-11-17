import { registerDbBridge } from './db/host';
import { modules } from './modules';
import './core/builtin-actions';
import { registerActionBridge } from './core/action-runtime';
import { initContextMenuBackground } from './core/context-menu';
import { initAutoBackup } from './core/auto-backup-background';
import { initOnboarding } from './core/onboarding';
import { initSelfUpdate } from './core/self-update';

// Dinleyiciler service worker üst düzeyinde, eşzamanlı kaydedilmelidir.
initOnboarding();
for (const module of modules) module.initBackground();
initContextMenuBackground();
registerDbBridge();
registerActionBridge();
initAutoBackup();
initSelfUpdate();

// Görevler modülü 0.5.8'de kaldırıldı: eski hatırlatma alarmlarını ve ayarını temizle.
// (Görev verileri veritabanında ve yedekte kalır.)
void (async () => {
  const alarms = (await chrome.alarms.getAll()).filter(a => a.name.startsWith('task-due:'));
  await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)));
  await chrome.storage.local.remove('taskDueReminders');
})().catch(() => {});
// Sabit Sekme Koruyucu ve Komut Merkezi 0.7.0'da kaldırıldı: kalan küçük ayar/kayıtları temizle.
void chrome.storage.local.remove(['pinnedGuardClosed']).catch(() => {});
void chrome.storage.session.remove(['pinnedGuardTabs', 'commandCenterTarget', 'tabSwitcherMru']).catch(() => {});
