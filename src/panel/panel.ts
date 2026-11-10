import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { CLIP_SLOTS_ID } from '../modules/clip-slots/background';
import { initClipSlotsPanel } from '../modules/clip-slots/panel';
import { LIFE_BROWSER_ID } from '../modules/life-browser/background';
import { initLifeBrowserPanel } from '../modules/life-browser/panel';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { initLinkCleanerPanel } from '../modules/link-cleaner/panel';
import { PINNED_GUARD_ID } from '../modules/pinned-guard/background';
import { initPinnedGuardPanel } from '../modules/pinned-guard/panel';
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
import { initVideoPanel } from '../modules/video-downloader/panel';
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
const clip = initClipSlotsPanel();
const refreshPip = initPipSettings();

const shortcutsSection = document.querySelector('#shortcuts-panel') as HTMLElement;
const shortcuts = initShortcutsPanel();
const siteToolbar = initSiteToolbarPanel();
const tabTools = initTabToolsPanel();
document.querySelector('#open-tab-manager')?.addEventListener('click', () => { void chrome.tabs.create({ url: chrome.runtime.getURL('tabs.html') }); });
const lifeBrowser = initLifeBrowserPanel();
const zombies = initZombieTabsPanel();
const pinned = initPinnedGuardPanel();

const timeTracker = initTimeTrackerPanel();
const tasksSection = document.querySelector('#quick-tasks-panel') as HTMLElement;
const tasks = initQuickTasksPanel();

const renderModules = initModulesToggle(refresh);

const smart = initSmartRepliesPanel();
const cleaner = initLinkCleanerPanel();
const blocker = initBlockerPanel();
const memo = initSlapMemoPanel();

const { updateSubTabs, memoSection, smartSection } = initSubTabs();
const refreshMedia = initMediaSettings(videoPanel);

async function refresh(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  await refreshMedia(flags);

  await renderModules(flags);
  await updateSubTabs(flags);

  if (resolveEnabled(flags, WATCHLIST_ID)) await watch.render();
  if (resolveEnabled(flags, CLIP_SLOTS_ID)) await clip.render();
  await refreshPip(flags);
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
    void refresh();
  }
});

initAyarlarAnchors();

void refresh().then(() => scrollToInitialHash());
void showDbStatus();
void initStoragePanel().render();

initBackup();
initNavigation(memoSection, smartSection);
initTheme();
void isModuleEnabled;
