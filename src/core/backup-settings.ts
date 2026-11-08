import { SETTINGS_KEY as X_VIDEO_SETTINGS_KEY } from '../modules/x-video/shared';
import { CLIP_SLOTS_KEY } from '../modules/clip-slots/slots';
import { TITLE_RULES_KEY } from '../modules/title-cleaner/cleaner';
import { TRANSFER_KEY } from '../modules/tab-notes/background';
import { MODULE_FLAGS_KEY } from './module-state';
import { SITES_KEY } from '../modules/smart-replies/background';
import { EXCLUDED_KEY } from '../modules/time-tracker/background';
import { ZOMBIE_HOURS_KEY } from '../modules/zombie-tabs/zombie';
import { TOOLBAR_SITES_KEY } from '../modules/site-toolbar/settings';
import { PAGE_COPY_KEY } from '../modules/slapmemo/settings';
export function backupSettingKeys(): string[] { return ['ui_theme', X_VIDEO_SETTINGS_KEY, MODULE_FLAGS_KEY, 'enabled', 'blockedHandles', SITES_KEY, EXCLUDED_KEY, ZOMBIE_HOURS_KEY, TITLE_RULES_KEY, TRANSFER_KEY, TOOLBAR_SITES_KEY, CLIP_SLOTS_KEY, PAGE_COPY_KEY]; }
