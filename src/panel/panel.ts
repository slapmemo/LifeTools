import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { CLIP_SLOTS_ID } from '../modules/clip-slots/background';
import { initClipSlotsPanel } from '../modules/clip-slots/panel';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { initLinkCleanerPanel } from '../modules/link-cleaner/panel';
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
import { openTabManager } from '../modules/tab-manager/open';
import { TIME_TRACKER_ID } from '../modules/time-tracker/background';
import { initTimeTrackerPanel } from '../modules/time-tracker/panel';
import { WATCHLIST_ID } from '../modules/watchlist/background';
import { initWatchlistPanel } from '../modules/watchlist/panel';
import { initVideoPanel } from '../modules/video-downloader/panel';
import { initCurrencyPanel } from '../modules/currency/panel';
import { ZOMBIE_TABS_ID } from '../modules/zombie-tabs/background';
import { initZombieTabsPanel } from '../modules/zombie-tabs/panel';
import { initStoragePanel } from '../popup/storage-panel';
import { showVersions } from '../core/desktop-version';
import { initBackup } from './sections/backup';
import { showDbStatus } from './sections/db-status';
import { initMediaSettings } from './sections/media-settings';
import { initModulesToggle } from './sections/modules-toggle';
import { initAyarlarAnchors, initNavigation, scrollToInitialHash } from './sections/navigation';
import { initPipSettings } from './sections/pip';
import { initSubTabs } from './sections/subtabs';
import { initTheme } from './sections/theme';

void showVersions(document.querySelector<HTMLElement>('#panel-version')!, document.querySelector<HTMLElement>('#video-version-warning')!);

const watch = initWatchlistPanel();
const videoPanel = initVideoPanel();
const currencyPanel = initCurrencyPanel();
const clip = initClipSlotsPanel();
const refreshPip = initPipSettings();

const shortcutsSection = document.querySelector('#shortcuts-panel') as HTMLElement;
const shortcuts = initShortcutsPanel();
const siteToolbar = initSiteToolbarPanel();
const tabTools = initTabToolsPanel();
// Açık bir Yönetici sekmesi varsa ona geç; her tıklamada yeni sekme açılmasın.
document.querySelector('#open-tab-manager')?.addEventListener('click', () => { void openTabManager(); });
const zombies = initZombieTabsPanel();

const timeTracker = initTimeTrackerPanel();

const renderModules = initModulesToggle();

const smart = initSmartRepliesPanel();
const cleaner = initLinkCleanerPanel();
const blocker = initBlockerPanel();
const memo = initSlapMemoPanel();

const { updateSubTabs, memoSection, smartSection } = initSubTabs();
const refreshMedia = initMediaSettings(videoPanel);

/** Bir bölüm hata verirse (ör. masaüstü kapalıyken) diğer bölümler yine çizilsin. */
async function safe(name: string, fn: () => Promise<unknown> | unknown): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.debug(`[LifeTools] panel bölümü çizilemedi: ${name}`, err);
  }
}

async function refresh(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  await safe('media', () => refreshMedia(flags));
  await safe('currency', () => currencyPanel.render(flags));

  await safe('modules', () => renderModules(flags));
  await safe('subtabs', () => updateSubTabs(flags));

  if (resolveEnabled(flags, WATCHLIST_ID)) await safe('watchlist', () => watch.render());
  if (resolveEnabled(flags, CLIP_SLOTS_ID)) await safe('clip-slots', () => clip.render());
  await safe('pip', () => refreshPip(flags));
  await safe('tab-tools', () => tabTools.render());
  if (resolveEnabled(flags, TIME_TRACKER_ID)) await safe('time-tracker', () => timeTracker.render());
  if (resolveEnabled(flags, SMART_REPLIES_ID)) await safe('smart-replies', () => smart.render());
  if (resolveEnabled(flags, SITE_BLOCKER_ID)) await safe('site-blocker', () => blocker.render());
  if (resolveEnabled(flags, SLAPMEMO_ID)) await safe('slapmemo', () => memo.render());
  if (resolveEnabled(flags, LINK_CLEANER_ID)) await safe('link-cleaner', () => cleaner.render());
  if (resolveEnabled(flags, ZOMBIE_TABS_ID)) await safe('zombies', () => zombies.render());
  const shortcutsOn = resolveEnabled(flags, SHORTCUTS_ID);
  shortcutsSection.hidden = !shortcutsOn;
  const shortcutsAnchor = document.querySelector<HTMLElement>('[data-ayarlar-anchor="shortcuts-panel"]');
  if (shortcutsAnchor) shortcutsAnchor.hidden = !shortcutsOn;
  if (shortcutsOn) await safe('shortcuts', () => shortcuts.render());
  if (resolveEnabled(flags, SITE_TOOLBAR_ID)) await safe('site-toolbar', () => siteToolbar.render());
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
    void refresh();
  }
});

// Kullanıcı başka sekmeye geçip panele dönünce "bu sayfa" bölümleri o sekmeye göre tazelensin.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  void safe('tab-tools', () => tabTools.render());
  void chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }).then(data => {
    if (resolveEnabled(data[MODULE_FLAGS_KEY], LINK_CLEANER_ID)) void safe('link-cleaner', () => cleaner.render());
  });
});

initAyarlarAnchors();

void refresh().then(() => scrollToInitialHash());
void showDbStatus();
void initStoragePanel().render();

initBackup();
initNavigation(memoSection, smartSection);
// Marka altındaki sürüm HTML'de sabit "v0.1" idi; gerçek eklenti sürümünü göster.
document.querySelectorAll('.brand-text span, .topbar .version').forEach(el => { el.textContent = `Sürüm ${chrome.runtime.getManifest().version}`; });
initTheme();
void isModuleEnabled;
