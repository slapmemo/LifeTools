import { X_VIDEO_ID, SETTINGS_KEY as X_VIDEO_SETTINGS_KEY, defaults as xVideoDefaults } from '../modules/x-video/shared';
import { WATCHLIST_ID } from '../modules/watchlist/background';
import { initWatchlistPanel } from '../modules/watchlist/panel';
import { PIP_ID } from '../modules/pip/background';
import { CLIP_SLOTS_ID } from '../modules/clip-slots/background';
import { initClipSlotsPanel } from '../modules/clip-slots/panel';
import { requestRunAction } from '../core/actions';
import { initTabToolsPanel } from '../modules/tab-notes/panel';
import { exportData, restoreData, validateBackup, type Backup } from '../core/backup';
import { backupSettingKeys } from '../core/backup-settings';
import { TIME_TRACKER_ID } from '../modules/time-tracker/background';
import { initTimeTrackerPanel } from '../modules/time-tracker/panel';
import { QUICK_TASKS_ID } from '../modules/quick-tasks/background';
import { initQuickTasksPanel } from '../modules/quick-tasks/panel';
import { SMART_REPLIES_ID } from '../modules/smart-replies/background';
import { initSmartRepliesPanel } from '../modules/smart-replies/panel';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { initLinkCleanerPanel } from '../modules/link-cleaner/panel';
import { isModuleEnabled, MODULE_FLAGS_KEY, setModuleEnabled } from '../core/module-state';
import { popupDb } from '../db/client';
import { initStoragePanel } from './storage-panel';
import { modules } from '../modules';
import { SITE_BLOCKER_ID } from '../modules/site-blocker/background';
import { initBlockerPanel } from '../modules/site-blocker/panel';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { initSlapMemoPanel } from '../modules/slapmemo/panel';
import { LIFE_BROWSER_ID } from '../modules/life-browser/background';
import { initLifeBrowserPanel } from '../modules/life-browser/panel';
import { ZOMBIE_TABS_ID } from '../modules/zombie-tabs/background';
import { initZombieTabsPanel } from '../modules/zombie-tabs/panel';
import { PINNED_GUARD_ID } from '../modules/pinned-guard/background';
import { initPinnedGuardPanel } from '../modules/pinned-guard/panel';

import { SHORTCUTS_ID } from '../modules/shortcuts/background';
import { initShortcutsPanel } from '../modules/shortcuts/panel';
import { SITE_TOOLBAR_ID } from '../modules/site-toolbar/background';
import { initSiteToolbarPanel } from '../modules/site-toolbar/panel';

const watchSection = document.querySelector('#watchlist-panel') as HTMLElement;
const watch = initWatchlistPanel();
const clipSection = document.querySelector('#clip-slots-panel') as HTMLElement;
const clip = initClipSlotsPanel();
const pipSection = document.querySelector('#pip-panel') as HTMLElement;
document.querySelector('#pip-toggle')!.addEventListener('click', () => { void (async () => { const tab = (await chrome.tabs.query({active:true,currentWindow:true}))[0]; const result = await requestRunAction('pip.toggle', undefined, tab?.id); (document.querySelector('#pip-feedback') as HTMLElement).textContent = result.message ?? (result.ok ? 'İşlem tamamland?.' : 'İşlem başarısız.'); })(); });
const shortcutsSection = document.querySelector('#shortcuts-panel') as HTMLElement;
const shortcuts = initShortcutsPanel();
const toolbarSection = document.querySelector('#site-toolbar-panel') as HTMLElement;
const siteToolbar = initSiteToolbarPanel();
const tabTools = initTabToolsPanel();
const lifeBrowserSection = document.querySelector('#life-browser-panel') as HTMLElement;
const lifeBrowser = initLifeBrowserPanel();
const zombieSection = document.querySelector('#zombie-tabs-panel') as HTMLElement;
const zombies = initZombieTabsPanel();
const pinnedSection = document.querySelector('#pinned-guard-panel') as HTMLElement;
const pinned = initPinnedGuardPanel();

const timeSection = document.querySelector('#time-tracker-panel') as HTMLElement;
const timeTracker = initTimeTrackerPanel();
const tasksSection = document.querySelector('#quick-tasks-panel') as HTMLElement;
const tasks = initQuickTasksPanel();

const modulesList = document.querySelector('#modules-list') as HTMLElement;
const blockerSection = document.querySelector('#blocker-panel') as HTMLElement;
const dbStatus = document.querySelector('#db-status') as HTMLElement;

const memoSection = document.querySelector('#slapmemo-panel') as HTMLElement;

const cleanerSection = document.querySelector('#link-cleaner-panel') as HTMLElement;
const smartSection = document.querySelector('#smart-replies-panel') as HTMLElement;
const smart = initSmartRepliesPanel();
const cleaner = initLinkCleanerPanel();
const blocker = initBlockerPanel();
const memo = initSlapMemoPanel();

async function renderModules(): Promise<void> {
  modulesList.replaceChildren();
  for (const module of modules) {
    const enabled = await isModuleEnabled(module.id);

    const item = document.createElement('li');
    item.className = 'module-item';

    const text = document.createElement('div');
    text.className = 'module-text';
    const name = document.createElement('strong');
    name.textContent = module.name;
    const desc = document.createElement('p');
    desc.textContent = module.description;
    text.append(name, desc);

    const label = document.createElement('label');
    label.className = 'switch';
    label.setAttribute('aria-label', `${module.name} aç veya kapat`);
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = enabled;
    input.addEventListener('change', () => {
      void setModuleEnabled(module.id, input.checked).then(refresh);
    });
    const track = document.createElement('span');
    track.className = 'switch-track';
    label.append(input, track);

    item.append(text, label);
    modulesList.append(item);
  }
}

const xVideoPanel = document.querySelector('#x-video-panel') as HTMLElement;
const xQuality = document.querySelector('#x-video-quality') as HTMLSelectElement;
const xOneClick = document.querySelector('#x-video-one-click') as HTMLInputElement;
const xSaveAs = document.querySelector('#x-video-save-as') as HTMLInputElement;
for (const control of [xQuality, xOneClick, xSaveAs]) control.addEventListener('change', () => { void chrome.storage.local.set({[X_VIDEO_SETTINGS_KEY]: {quality:xQuality.value, oneClick:xOneClick.checked, saveAs:xSaveAs.checked}}); });
async function refresh(): Promise<void> {
  xVideoPanel.hidden = !await isModuleEnabled(X_VIDEO_ID);
  const xData = await chrome.storage.local.get({[X_VIDEO_SETTINGS_KEY]: xVideoDefaults});
  const xSettings = {...xVideoDefaults, ...xData[X_VIDEO_SETTINGS_KEY]};
  xQuality.value = xSettings.quality; xOneClick.checked = xSettings.oneClick; xSaveAs.checked = xSettings.saveAs;
  await renderModules();
  watchSection.hidden = !await isModuleEnabled(WATCHLIST_ID); if (!watchSection.hidden) await watch.render();
  clipSection.hidden = !await isModuleEnabled(CLIP_SLOTS_ID); if (!clipSection.hidden) await clip.render();
  pipSection.hidden = !await isModuleEnabled(PIP_ID);
  await tabTools.render();
  timeSection.hidden = !(await isModuleEnabled(TIME_TRACKER_ID));
  if (!timeSection.hidden) await timeTracker.render();
  tasksSection.hidden = !(await isModuleEnabled(QUICK_TASKS_ID));
  if (!tasksSection.hidden) await tasks.render();
  smartSection.hidden = !(await isModuleEnabled(SMART_REPLIES_ID));
  if (!smartSection.hidden) await smart.render();
  blockerSection.hidden = !(await isModuleEnabled(SITE_BLOCKER_ID));
  if (!blockerSection.hidden) await blocker.render();
  memoSection.hidden = !(await isModuleEnabled(SLAPMEMO_ID));
  if (!memoSection.hidden) await memo.render();
  cleanerSection.hidden = !(await isModuleEnabled(LINK_CLEANER_ID));
  if (!cleanerSection.hidden) await cleaner.render();
  lifeBrowserSection.hidden = !(await isModuleEnabled(LIFE_BROWSER_ID));
  if (!lifeBrowserSection.hidden) await lifeBrowser.render();
  zombieSection.hidden = !(await isModuleEnabled(ZOMBIE_TABS_ID));
  if (!zombieSection.hidden) await zombies.render();
  pinnedSection.hidden = !(await isModuleEnabled(PINNED_GUARD_ID));
  if (!pinnedSection.hidden) await pinned.render();
  shortcutsSection.hidden = !(await isModuleEnabled(SHORTCUTS_ID));
  if (!shortcutsSection.hidden) await shortcuts.render();
  toolbarSection.hidden = !(await isModuleEnabled(SITE_TOOLBAR_ID));
  if (!toolbarSection.hidden) await siteToolbar.render();
}

async function showDbStatus(): Promise<void> {
  try {
    const version = await popupDb.schemaVersion();
    dbStatus.textContent = `Veritabanı durumu: hazır (şema sürümü ${version})`;
    dbStatus.className = 'db-status ok';
  } catch (err) {
    dbStatus.textContent = `Veritabanı durumu: hata — ${err instanceof Error ? err.message : String(err)}`;
    dbStatus.className = 'db-status error';
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
    void refresh();
  }
});

// Eylemler popup'ı sekme olarak açıp bir bölüme yönlendirebilir: popup.html#<bölüm-kimliği>
void refresh().then(() => {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'backup-download') { (document.getElementById('backup-section') ?? document.body).scrollIntoView(); (document.getElementById('backup-download') as HTMLButtonElement | null)?.click(); }
  else if (hash) document.getElementById(hash)?.scrollIntoView();
});
void showDbStatus();
void initStoragePanel().render();

const backupFile = document.querySelector('#backup-file') as HTMLInputElement;
const backupPreview = document.querySelector('#backup-preview') as HTMLElement;
const backupFeedback = document.querySelector('#backup-feedback') as HTMLElement;
const backupRestore = document.querySelector('#backup-restore') as HTMLButtonElement;
let selectedBackup: Backup | null = null;
const backupError = (err: unknown): void => { backupFeedback.textContent = `Hata: ${err instanceof Error ? err.message : String(err)}`; };
document.querySelector('#backup-download')!.addEventListener('click', () => { void (async () => {
  try {
    const data = await exportData(popupDb, await chrome.storage.local.get(backupSettingKeys()));
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `lifetools-yedek-${data.exported_at.slice(0, 10)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); backupFeedback.textContent = 'Yedek indirildi.';
  } catch (err) { backupError(err); }
})(); });
backupFile.addEventListener('change', () => { void (async () => {
  selectedBackup = null; backupRestore.hidden = true; backupPreview.textContent = ''; backupFeedback.textContent = '';
  if (!backupFile.files?.[0]) return;
  try {
    selectedBackup = validateBackup(JSON.parse(await backupFile.files[0].text()));
    const t = selectedBackup.tables;
    backupPreview.textContent = `${t.notes.length} not, ${t.snippets.length} şablon, ${t.tasks.length} görev, ${t.site_time.length} site süresi kaydı, ${t.sessions.length} oturum (${t.session_tabs.length} sekme). Mevcut veriler ve ayarlar değiştirilecek.`;
    backupRestore.hidden = false;
  } catch (err) { backupError(err); }
})(); });
backupRestore.addEventListener('click', () => { void (async () => {
  if (!selectedBackup) return;
  backupRestore.disabled = true; backupFile.disabled = true;
  try {
    const settings = selectedBackup.settings;
    await restoreData(popupDb, selectedBackup);
    const keys = backupSettingKeys();
    await chrome.storage.local.remove(keys);
    await chrome.storage.local.set(Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(settings, key)).map(key => [key, settings[key]])));
    backupFeedback.textContent = 'Yedek geri yüklendi. Eklenti yeniden başlatılıyor…';
    setTimeout(() => chrome.runtime.reload(), 1000);
  } catch (err) { backupError(err); backupRestore.disabled = false; backupFile.disabled = false; }
})(); });
