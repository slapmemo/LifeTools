import { SETTINGS_KEY as X_VIDEO_SETTINGS_KEY } from '../modules/x-video/shared';
import { SETTINGS_KEY as INSTAGRAM_SETTINGS_KEY } from '../modules/instagram/shared';
import { CLIP_SLOTS_KEY } from '../modules/clip-slots/slots';
import { TITLE_RULES_KEY } from '../modules/title-cleaner/cleaner';
import { TRANSFER_KEY } from '../modules/tab-notes/background';
import { MODULE_FLAGS_KEY } from './module-state';
import { SITES_KEY } from '../modules/smart-replies/background';
import { EXCLUDED_KEY } from '../modules/time-tracker/background';
import { ZOMBIE_HOURS_KEY } from '../modules/zombie-tabs/zombie';
import { TOOLBAR_SITES_KEY } from '../modules/site-toolbar/settings';
import { PAGE_COPY_KEY } from '../modules/slapmemo/settings';
export function backupSettingKeys(): string[] { return ['ui_theme', X_VIDEO_SETTINGS_KEY, INSTAGRAM_SETTINGS_KEY, MODULE_FLAGS_KEY, 'enabled', 'blockedHandles', SITES_KEY, EXCLUDED_KEY, ZOMBIE_HOURS_KEY, TITLE_RULES_KEY, TRANSFER_KEY, TOOLBAR_SITES_KEY, CLIP_SLOTS_KEY, PAGE_COPY_KEY, ...EXTRA_SETTING_KEYS]; }

/**
 * Modüllerin kullanıcı ayarları (durum/önbellek değil). Adlar modüllerdeki `*_KEY` sabitleriyle aynı;
 * `tests/backup-settings-keys.test.ts` her birinin kaynakta tanımlı olduğunu denetler.
 */
export const EXTRA_SETTING_KEYS = [
  'timeTrackerLimits', 'timeTrackerLimitsEnabled',
  'currency.settings',
  'pip_hover_enabled',
  'slapmemoBubbleEnabled', 'slapmemoBubbleHiddenSites', 'slapmemoPageHintEnabled',
  'linkCleanerAutoEnabled', 'linkCleanerExpandShortLinks',
  'instagram.speed',
  'watchlistPageButtonEnabled',
  'videoDownloaderYoutubeButton', 'downloads.subfolder',
  'tabLabelsShowInTitle', 'tabNotesShowOnRevisit',
  'tabManagerPinnedFirst', 'lifeBrowserAutoSave',
  'zombieAutoSleep', 'zombieWeekly',
  'autoBackupEnabled'
] as const;

export function settingsRestorePlan(settings: Record<string, unknown>, keys: string[]): { remove: string[]; set: Record<string, unknown> } {
  const present = keys.filter(key => Object.prototype.hasOwnProperty.call(settings, key));
  return { remove: present.length ? keys : [], set: Object.fromEntries(present.map(key => [key, settings[key]])) };
}
