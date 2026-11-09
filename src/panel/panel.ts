import { icon, type IconName } from '../../design/icons';
import { requestRunAction } from '../core/actions';
import { restoreData, validateBackup, type Backup } from '../core/backup';
import { backupSettingKeys, settingsRestorePlan } from '../core/backup-settings';
import { AUTO_BACKUP_ENABLED_KEY, LAST_AUTO_BACKUP_KEY } from '../core/auto-backup';
import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled, setModuleEnabled } from '../core/module-state';
import { applyTheme } from '../core/theme';
import {
  categories,
  groupModulesByCategory,
  metinTabs,
  notlarTabs,
  odakTabs,
  resolveActiveTab,
  routeCategory,
  sekmelerTabs,
  type MetinSubTab,
  type NotlarSubTab,
  type OdakSubTab,
  type SekmelerSubTab
} from '../core/ui-visibility';
import { popupDb } from '../db/client';
import { modules } from '../modules';
import { CLIP_SLOTS_ID } from '../modules/clip-slots/background';
import { initClipSlotsPanel } from '../modules/clip-slots/panel';
import { LIFE_BROWSER_ID } from '../modules/life-browser/background';
import { initLifeBrowserPanel } from '../modules/life-browser/panel';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { initLinkCleanerPanel } from '../modules/link-cleaner/panel';
import { PINNED_GUARD_ID } from '../modules/pinned-guard/background';
import { initPinnedGuardPanel } from '../modules/pinned-guard/panel';
import { PIP_ID } from '../modules/pip/background';
import { PIP_HOVER_ENABLED_KEY, PIP_HOVER_ORIGINS } from '../modules/pip/hover-logic';
import { QUICK_TASKS_ID } from '../modules/quick-tasks/background';
import { initQuickTasksPanel } from '../modules/quick-tasks/panel';
import { SHORTCUTS_ID } from '../modules/shortcuts/background';
import { initShortcutsPanel } from '../modules/shortcuts/panel';
import { SITE_BLOCKER_ID } from '../modules/site-blocker/background';
import { initBlockerPanel } from '../modules/site-blocker/panel';
import { SITE_TOOLBAR_ID } from '../modules/site-toolbar/background';
import { initSiteToolbarPanel } from '../modules/site-toolbar/panel';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { initSlapMemoPanel } from '../modules/slapmemo/panel';
import { SMART_REPLIES_ID } from '../modules/smart-replies/background';
import { initSmartRepliesPanel } from '../modules/smart-replies/panel';
import { initTabToolsPanel } from '../modules/tab-notes/panel';
import { TIME_TRACKER_ID } from '../modules/time-tracker/background';
import { initTimeTrackerPanel } from '../modules/time-tracker/panel';
import { WATCHLIST_ID } from '../modules/watchlist/background';
import { initWatchlistPanel } from '../modules/watchlist/panel';
import { defaults as xVideoDefaults, SETTINGS_KEY as X_VIDEO_SETTINGS_KEY, X_VIDEO_ID } from '../modules/x-video/shared';
import { defaults as instagramDefaults, SETTINGS_KEY as INSTAGRAM_SETTINGS_KEY, INSTAGRAM_ID } from '../modules/instagram/shared';
import { ZOMBIE_TABS_ID } from '../modules/zombie-tabs/background';
import { initZombieTabsPanel } from '../modules/zombie-tabs/panel';
import { initStoragePanel } from '../popup/storage-panel';
import { confirmSecondClick, showToast } from './ui';

const watchSection = document.querySelector('#watchlist-panel') as HTMLElement;
const watch = initWatchlistPanel();
const clipSection = document.querySelector('#clip-slots-panel') as HTMLElement;
const clip = initClipSlotsPanel();
const pipSection = document.querySelector('#pip-panel') as HTMLElement;
const pipFeedback = document.querySelector('#pip-feedback') as HTMLElement;
const pipShortcutHint = document.getElementById('pip-shortcut-hint');
const pipShortcutChange = document.getElementById('pip-shortcut-change');
const pipHover = document.querySelector<HTMLInputElement>('#pip-hover-enabled')!;
pipHover.addEventListener('change', () => {
  const requested = pipHover.checked;
  const permission = requested ? chrome.permissions.request({ origins: PIP_HOVER_ORIGINS }) : Promise.resolve(true);
  void permission.then(async granted => {
    if (!granted) { pipHover.checked = false; showToast('Site izni verilmedi.', 'error'); return; }
    await chrome.storage.local.set({ [PIP_HOVER_ENABLED_KEY]: requested });
  }).catch(() => { pipHover.checked = !requested; showToast('Ayar kaydedilemedi.', 'error'); });
});

document.querySelector('#pip-toggle')!.addEventListener('click', () => {
  void (async () => {
    const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    const result = await requestRunAction('pip.toggle', undefined, tab?.id);
    const msg = result.message ?? (result.ok ? 'İşlem tamamlandı.' : 'İşlem başarısız.');
    pipFeedback.textContent = msg;
    pipFeedback.hidden = false;
    showToast(msg, result.ok ? 'info' : 'error');
  })();
});

pipShortcutChange?.addEventListener('click', () => {
  void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

async function refreshPipShortcut(): Promise<void> {
  if (!pipShortcutHint || !chrome.commands?.getAll) return;
  try {
    const cmds = await chrome.commands.getAll();
    const pipCmd = cmds.find(c => c.name === 'toggle-pip');
    const key = pipCmd?.shortcut?.trim();
    pipShortcutHint.textContent = `Kısayol: ${key || 'Atanmamış'}`;
  } catch {
    pipShortcutHint.textContent = 'Kısayol: Atanmamış';
  }
}

const shortcutsSection = document.querySelector('#shortcuts-panel') as HTMLElement;
const shortcuts = initShortcutsPanel();
const toolbarSection = document.querySelector('#site-toolbar-panel') as HTMLElement;
const siteToolbar = initSiteToolbarPanel();
const tabToolsSection = document.querySelector('#tab-tools') as HTMLElement;
const tabTools = initTabToolsPanel();
const lifeBrowserSection = document.querySelector('#life-browser-panel') as HTMLElement;
document.querySelector('#open-tab-manager')?.addEventListener('click', () => { void chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') }); });
const lifeBrowser = initLifeBrowserPanel();
const temizlikSection = document.querySelector('#sekmeler-temizlik') as HTMLElement;
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

let notlarTab: NotlarSubTab = 'slapmemo';
let metinTab: MetinSubTab = 'smart-replies';
let sekmelerTab: SekmelerSubTab = 'oturumlar';
let odakTab: OdakSubTab = 'engelleyici';
let activeCategory = 'notlar';

const notlarTabsWrap = document.getElementById('notlar-tabs')!;
const memoNewBtn = document.getElementById('memo-new-btn') as HTMLButtonElement;
const watchNewBtn = document.getElementById('watch-new-btn') as HTMLButtonElement;
const metinTabsWrap = document.getElementById('metin-tabs')!;
const sekmelerTabsWrap = document.getElementById('sekmeler-tabs')!;
const odakTabsWrap = document.getElementById('odak-tabs')!;

notlarTabsWrap.querySelectorAll<HTMLButtonElement>('[data-notlar-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    notlarTab = btn.dataset.notlarTab as NotlarSubTab;
    void updateSubTabs();
  });
});

metinTabsWrap.querySelectorAll<HTMLButtonElement>('[data-metin-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    metinTab = btn.dataset.metinTab as MetinSubTab;
    void updateSubTabs();
  });
});

sekmelerTabsWrap.querySelectorAll<HTMLButtonElement>('[data-sekmeler-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    sekmelerTab = btn.dataset.sekmelerTab as SekmelerSubTab;
    void updateSubTabs();
  });
});

odakTabsWrap.querySelectorAll<HTMLButtonElement>('[data-odak-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    odakTab = btn.dataset.odakTab as OdakSubTab;
    void updateSubTabs();
  });
});

async function updateSubTabs(rawFlags?: unknown): Promise<void> {
  const flags =
    rawFlags !== undefined
      ? rawFlags
      : (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];

  // Notlar
  const enabledNotlar = notlarTabs(flags);
  notlarTab = resolveActiveTab(notlarTab, enabledNotlar, 'slapmemo');
  notlarTabsWrap.hidden = enabledNotlar.length <= 1;
  notlarTabsWrap.querySelectorAll<HTMLButtonElement>('[data-notlar-tab]').forEach(btn => {
    const key = btn.dataset.notlarTab as NotlarSubTab;
    btn.hidden = !enabledNotlar.includes(key);
    const active = key === notlarTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  const showMemo = enabledNotlar.includes('slapmemo') && notlarTab === 'slapmemo';
  const showWatch = enabledNotlar.includes('watchlist') && notlarTab === 'watchlist';
  memoSection.hidden = !showMemo;
  watchSection.hidden = !showWatch;
  memoNewBtn.hidden = !showMemo;
  watchNewBtn.hidden = !showWatch;

  // Metin
  const enabledMetin = metinTabs(flags);
  metinTab = resolveActiveTab(metinTab, enabledMetin, 'smart-replies');
  metinTabsWrap.hidden = enabledMetin.length <= 1;
  metinTabsWrap.querySelectorAll<HTMLButtonElement>('[data-metin-tab]').forEach(btn => {
    const key = btn.dataset.metinTab as MetinSubTab;
    btn.hidden = !enabledMetin.includes(key);
    const active = key === metinTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  smartSection.hidden = !(enabledMetin.includes('smart-replies') && metinTab === 'smart-replies');
  clipSection.hidden = !(enabledMetin.includes('clip-slots') && metinTab === 'clip-slots');
  cleanerSection.hidden = !(enabledMetin.includes('link-cleaner') && metinTab === 'link-cleaner');

  // Sekmeler
  const enabledSekmeler = sekmelerTabs(flags);
  sekmelerTab = resolveActiveTab(sekmelerTab, enabledSekmeler, 'oturumlar');
  sekmelerTabsWrap.hidden = enabledSekmeler.length <= 1;
  sekmelerTabsWrap.querySelectorAll<HTMLButtonElement>('[data-sekmeler-tab]').forEach(btn => {
    const key = btn.dataset.sekmelerTab as SekmelerSubTab;
    btn.hidden = !enabledSekmeler.includes(key);
    const active = key === sekmelerTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  lifeBrowserSection.hidden = !(enabledSekmeler.includes('oturumlar') && sekmelerTab === 'oturumlar');
  temizlikSection.hidden = !(enabledSekmeler.includes('temizlik') && sekmelerTab === 'temizlik');
  zombieSection.hidden = !resolveEnabled(flags, ZOMBIE_TABS_ID);
  pinnedSection.hidden = !resolveEnabled(flags, PINNED_GUARD_ID);
  tabToolsSection.hidden = !(enabledSekmeler.includes('etiket-notlar') && sekmelerTab === 'etiket-notlar');
  toolbarSection.hidden = !(enabledSekmeler.includes('arac-cubugu') && sekmelerTab === 'arac-cubugu');

  // Odak
  const enabledOdak = odakTabs(flags);
  odakTab = resolveActiveTab(odakTab, enabledOdak, 'engelleyici');
  odakTabsWrap.hidden = enabledOdak.length <= 1;
  odakTabsWrap.querySelectorAll<HTMLButtonElement>('[data-odak-tab]').forEach(btn => {
    const key = btn.dataset.odakTab as OdakSubTab;
    btn.hidden = !enabledOdak.includes(key);
    const active = key === odakTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  blockerSection.hidden = !(enabledOdak.includes('engelleyici') && odakTab === 'engelleyici');
  timeSection.hidden = !(enabledOdak.includes('sureler') && odakTab === 'sureler');
}

async function renderModules(rawFlags?: unknown): Promise<void> {
  const flags =
    rawFlags !== undefined
      ? rawFlags
      : (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  modulesList.replaceChildren();

  const grouped = groupModulesByCategory(modules);
  for (const cat of grouped) {
    const block = document.createElement('div');
    block.className = 'module-category-block';

    const h4 = document.createElement('h4');
    h4.className = 'module-category-heading';
    h4.append(icon(cat.icon, 15), cat.label);

    const ul = document.createElement('ul');
    ul.className = 'module-category-list';

    for (const module of cat.modules) {
      const enabled = resolveEnabled(flags, module.id);

      const item = document.createElement('li');
      item.className = 'module-item';

      const text = document.createElement('div');
      text.className = 'module-text';
      const name = document.createElement('strong');
      name.textContent = module.name;
      const desc = document.createElement('p');
      desc.className = 'clamp-1';
      desc.textContent = module.description;
      text.append(name, desc);

      const label = document.createElement('label');
      label.className = 'switch';
      label.setAttribute('aria-label', `${module.name} aç veya kapat`);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = enabled;
      input.addEventListener('change', () => {
        void setModuleEnabled(module.id, input.checked).then(() => {
          showToast(`${module.name} ${input.checked ? 'açıldı' : 'kapatıldı'}.`, 'info');
          return refresh();
        });
      });
      const track = document.createElement('span');
      track.className = 'switch-track';
      label.append(input, track);

      item.append(text, label);
      ul.append(item);
    }

    block.append(h4, ul);
    modulesList.append(block);
  }
}

const xVideoPanel = document.querySelector('#x-video-panel') as HTMLElement;
const instagramPanel = document.querySelector('#instagram-panel') as HTMLElement;
const instagramDownload = document.querySelector('#instagram-download') as HTMLInputElement;
const instagramSeek = document.querySelector('#instagram-seek') as HTMLInputElement;
const instagramSpeed = document.querySelector('#instagram-speed') as HTMLInputElement;
for (const control of [instagramDownload, instagramSeek, instagramSpeed]) control.addEventListener('change', () => {
  void chrome.storage.local.get({ [INSTAGRAM_SETTINGS_KEY]: instagramDefaults }).then(data => chrome.storage.local.set({ [INSTAGRAM_SETTINGS_KEY]: { ...data[INSTAGRAM_SETTINGS_KEY], downloadButton: instagramDownload.checked, seekBar: instagramSeek.checked, speedControl: instagramSpeed.checked } }));
});
const xVideoStatus = document.getElementById('x-video-status');
const xVideoHowtoIcon = document.getElementById('x-video-howto-icon');
if (xVideoHowtoIcon) xVideoHowtoIcon.replaceChildren(icon('clapperboard', 18));

const xQuality = document.querySelector('#x-video-quality') as HTMLSelectElement;
const xOneClick = document.querySelector('#x-video-one-click') as HTMLInputElement;
const xSaveAs = document.querySelector('#x-video-save-as') as HTMLInputElement;
for (const control of [xQuality, xOneClick, xSaveAs]) {
  control.addEventListener('change', () => {
    void chrome.storage.local
      .set({
        [X_VIDEO_SETTINGS_KEY]: {
          quality: xQuality.value,
          oneClick: xOneClick.checked,
          saveAs: xSaveAs.checked
        }
      })
      .then(() => showToast('X Video İndirici ayarları kaydedildi.', 'info'));
  });
}

async function refresh(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  const xEnabled = resolveEnabled(flags, X_VIDEO_ID);
  instagramPanel.hidden = !resolveEnabled(flags, INSTAGRAM_ID);
  const instagramData = await chrome.storage.local.get({ [INSTAGRAM_SETTINGS_KEY]: instagramDefaults });
  const instagramSettings = { ...instagramDefaults, ...instagramData[INSTAGRAM_SETTINGS_KEY] };
  instagramDownload.checked = instagramSettings.downloadButton;
  instagramSeek.checked = instagramSettings.seekBar;
  instagramSpeed.checked = instagramSettings.speedControl;
  xVideoPanel.hidden = !xEnabled;
  if (xVideoStatus) xVideoStatus.textContent = xEnabled ? 'Etkin' : 'Kapalı';

  const xData = await chrome.storage.local.get({ [X_VIDEO_SETTINGS_KEY]: xVideoDefaults });
  const xSettings = { ...xVideoDefaults, ...xData[X_VIDEO_SETTINGS_KEY] };
  xQuality.value = xSettings.quality;
  xOneClick.checked = xSettings.oneClick;
  xSaveAs.checked = xSettings.saveAs;

  await renderModules(flags);
  await updateSubTabs(flags);

  if (resolveEnabled(flags, WATCHLIST_ID)) await watch.render();
  if (resolveEnabled(flags, CLIP_SLOTS_ID)) await clip.render();
  pipSection.hidden = !resolveEnabled(flags, PIP_ID);
  if (!pipSection.hidden) {
    await refreshPipShortcut();
    const data = await chrome.storage.local.get({ [PIP_HOVER_ENABLED_KEY]: true });
    pipHover.checked = data[PIP_HOVER_ENABLED_KEY] !== false && await chrome.permissions.contains({ origins: PIP_HOVER_ORIGINS });
  }
  await tabTools.render();
  if (resolveEnabled(flags, TIME_TRACKER_ID)) await timeTracker.render();
  tasksSection.hidden = !resolveEnabled(flags, QUICK_TASKS_ID);
  if (!tasksSection.hidden) await tasks.render();
  if (resolveEnabled(flags, SMART_REPLIES_ID)) await smart.render();
  if (resolveEnabled(flags, SITE_BLOCKER_ID)) await blocker.render();
  if (resolveEnabled(flags, SLAPMEMO_ID)) await memo.render();
  if (resolveEnabled(flags, LINK_CLEANER_ID)) await cleaner.render();
  if (resolveEnabled(flags, LIFE_BROWSER_ID)) await lifeBrowser.render();
  if (resolveEnabled(flags, ZOMBIE_TABS_ID)) await zombies.render();
  if (resolveEnabled(flags, PINNED_GUARD_ID)) await pinned.render();
  const shortcutsOn = resolveEnabled(flags, SHORTCUTS_ID);
  shortcutsSection.hidden = !shortcutsOn;
  const shortcutsAnchor = document.querySelector<HTMLElement>('[data-ayarlar-anchor="shortcuts-panel"]');
  if (shortcutsAnchor) shortcutsAnchor.hidden = !shortcutsOn;
  if (shortcutsOn) await shortcuts.render();
  if (resolveEnabled(flags, SITE_TOOLBAR_ID)) await siteToolbar.render();
}

async function showDbStatus(): Promise<void> {
  try {
    const version = await popupDb.schemaVersion();
    dbStatus.textContent = `Veritabanı durumu: hazır (şema sürümü ${version})`;
    dbStatus.className = 'chip db-status ok';
  } catch (err) {
    dbStatus.textContent = `Veritabanı durumu: hata — ${err instanceof Error ? err.message : String(err)}`;
    dbStatus.className = 'chip chip-danger db-status error';
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
    void refresh();
  }
});

const AYARLAR_ANCHORS = new Set([
  'modules-section',
  'shortcuts-panel',
  'theme-section',
  'storage-section',
  'backup-section',
  'backup-download'
]);

document.querySelectorAll<HTMLAnchorElement>('[data-ayarlar-anchor]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    const targetId = link.dataset.ayarlarAnchor!;
    document.querySelectorAll<HTMLElement>('[data-ayarlar-anchor]').forEach(a => {
      a.classList.toggle('active', a === link);
    });
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

void refresh().then(() => {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'backup-download') {
    (document.getElementById('backup-section') ?? document.body).scrollIntoView();
    (document.getElementById('backup-download') as HTMLButtonElement | null)?.click();
  } else if (hash && AYARLAR_ANCHORS.has(hash)) {
    document.getElementById(hash)?.scrollIntoView();
  }
});
void showDbStatus();
void initStoragePanel().render();

const backupFile = document.querySelector('#backup-file') as HTMLInputElement;
const backupPreview = document.querySelector('#backup-preview') as HTMLElement;
const backupFeedback = document.querySelector('#backup-feedback') as HTMLElement;
const backupRestore = document.querySelector('#backup-restore') as HTMLButtonElement;
let selectedBackup: Backup | null = null;

const backupError = (err: unknown): void => {
  const msg = `Hata: ${err instanceof Error ? err.message : String(err)}`;
  backupFeedback.textContent = msg;
  backupFeedback.className = 'feedback error';
  backupFeedback.hidden = false;
  showToast(msg, 'error');
};

const autoBackupEnabled = document.querySelector<HTMLInputElement>('#auto-backup-enabled')!;
const autoBackupLast = document.querySelector<HTMLElement>('#auto-backup-last')!;
async function refreshAutoBackup(): Promise<void> {
  const data = await chrome.storage.local.get([AUTO_BACKUP_ENABLED_KEY, LAST_AUTO_BACKUP_KEY]);
  autoBackupEnabled.checked = data[AUTO_BACKUP_ENABLED_KEY] !== false;
  const date = new Date(data[LAST_AUTO_BACKUP_KEY] as string);
  autoBackupLast.textContent = `Son otomatik yedek: ${Number.isNaN(date.getTime()) ? 'henüz yok' : new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)}`;
}
autoBackupEnabled.addEventListener('change', () => {
  void chrome.storage.local.set({ [AUTO_BACKUP_ENABLED_KEY]: autoBackupEnabled.checked }).catch(backupError);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[AUTO_BACKUP_ENABLED_KEY] || changes[LAST_AUTO_BACKUP_KEY])) void refreshAutoBackup();
});
void refreshAutoBackup();

function takeBackup(): void {
  void (async () => {
    try {
      const result = await requestRunAction('backup.download');
      if (!result.ok) throw new Error(result.message ?? 'Yedek indirilemedi.');
      backupFeedback.textContent = 'Yedek indirme işlemi başlatıldı.';
      backupFeedback.className = 'feedback';
      backupFeedback.hidden = false;
      showToast('Yedek indirme işlemi başlatıldı.', 'info');
    } catch (err) {
      backupError(err);
    }
  })();
}
document.querySelector('#backup-download')!.addEventListener('click', takeBackup);
document.querySelector('#auto-backup-now')!.addEventListener('click', takeBackup);

backupFile.addEventListener('change', () => {
  void (async () => {
    selectedBackup = null;
    backupRestore.hidden = true;
    backupRestore.textContent = 'Geri yükle';
    backupRestore.classList.remove('confirming');
    backupPreview.textContent = '';
    backupFeedback.textContent = '';
    backupFeedback.hidden = true;
    if (!backupFile.files?.[0]) return;
    try {
      selectedBackup = validateBackup(JSON.parse(await backupFile.files[0].text()));
      const t = selectedBackup.tables;
      backupPreview.textContent = `${t.notes.length} not, ${t.snippets.length} şablon, ${t.tasks.length} görev, ${t.site_time.length} site süresi kaydı, ${t.sessions.length} oturum (${t.session_tabs.length} sekme). Mevcut veriler ve ayarlar değiştirilecek.`;
      backupRestore.hidden = false;
    } catch (err) {
      backupError(err);
    }
  })();
});

confirmSecondClick(
  backupRestore,
  async () => {
    if (!selectedBackup) return;
    backupRestore.disabled = true;
    backupFile.disabled = true;
    try {
      const settings = selectedBackup.settings;
      await restoreData(popupDb, selectedBackup);
      const plan = settingsRestorePlan(settings, backupSettingKeys());
      if (plan.remove.length) {
        await chrome.storage.local.remove(plan.remove);
        await chrome.storage.local.set(plan.set);
      }
      backupFeedback.textContent = plan.remove.length
        ? 'Yedek geri yüklendi. Eklenti yeniden başlatılıyor…'
        : 'Yedek geri yüklendi (bu yedekte eklenti ayarı yok, mevcut ayarlar korundu). Eklenti yeniden başlatılıyor…';
      backupFeedback.className = 'feedback';
      backupFeedback.hidden = false;
      showToast('Yedek geri yüklendi.', 'info');
      setTimeout(() => chrome.runtime.reload(), 1000);
    } catch (err) {
      backupError(err);
      backupRestore.disabled = false;
      backupFile.disabled = false;
    }
  },
  'Emin misin? Geri yükle'
);

const pageHeadingIcons: Record<string, IconName> = {
  'notlar-heading': 'notebook-pen',
  'gorevler-heading': 'list-checks',
  'metin-heading': 'text-cursor-input',
  'sekmeler-heading': 'layout-grid',
  'odak-heading': 'timer',
  'medya-heading': 'clapperboard',
  'ayarlar-heading': 'settings'
};
for (const [id, name] of Object.entries(pageHeadingIcons)) {
  const h = document.getElementById(id);
  if (h) h.prepend(icon(name, 20), ' ');
}

const ALL_CATEGORIES = ['notlar', 'gorevler', 'metin', 'sekmeler', 'odak', 'medya', 'ayarlar'] as const;

const nav = document.getElementById('navigation')!;
async function route(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  const visible = categories(flags);
  const rawHash = location.hash.replace(/^#/, '');
  const normalizedHash = AYARLAR_ANCHORS.has(rawHash) ? '#ayarlar' : location.hash;
  const active = routeCategory(normalizedHash, visible);
  activeCategory = active;
  nav.replaceChildren();
  for (const category of visible) {
    const a = document.createElement('a');
    a.href = `#${category.id}`;
    a.title = category.label;
    a.setAttribute('aria-label', category.label);
    if (category.id === active) a.setAttribute('aria-current', 'page');
    a.className = (category.id === active ? 'active' : '') + (category.id === 'ayarlar' ? ' nav-settings' : '');
    const label = document.createElement('span');
    label.className = 'nav-tooltip';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = category.label;
    a.append(icon(category.icon, 18), label);
    nav.append(a);
  }
  for (const category of ALL_CATEGORIES) {
    const el = document.getElementById(category);
    if (!el) continue;
    el.hidden = category !== active;
    el.style.display = category === active ? '' : 'none';
  }
  if (AYARLAR_ANCHORS.has(rawHash) && rawHash !== 'backup-download') {
    document.getElementById(rawHash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('keydown', event => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
  if (activeCategory === 'notlar' && !memoSection.hidden) {
    const search = document.querySelector<HTMLInputElement>('#memo-search');
    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  } else if (activeCategory === 'metin' && !smartSection.hidden) {
    const search = document.querySelector<HTMLInputElement>('#snippet-search');
    if (search) {
      event.preventDefault();
      search.focus();
      search.select();
    }
  }
});

window.addEventListener('hashchange', () => void route());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[MODULE_FLAGS_KEY]) void route();
});
void route();

void applyTheme();
const themeSelect = document.querySelector('#theme-select') as HTMLSelectElement;
const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');

function syncThemeUi(value: string): void {
  themeSelect.value = value;
  themeButtons.forEach(btn => {
    const active = btn.dataset.themeValue === value;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

void chrome.storage.local.get({ ui_theme: 'system' }).then(data => {
  syncThemeUi(String(data.ui_theme || 'system'));
});

themeButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const value = btn.dataset.themeValue ?? 'system';
    syncThemeUi(value);
    void chrome.storage.local.set({ ui_theme: value }).then(applyTheme);
  });
});

themeSelect.addEventListener('change', () => {
  syncThemeUi(themeSelect.value);
  void chrome.storage.local.set({ ui_theme: themeSelect.value }).then(applyTheme);
});
void isModuleEnabled;
