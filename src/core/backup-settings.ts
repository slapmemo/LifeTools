import { TITLE_RULES_KEY } from '../modules/title-cleaner/cleaner';
import { TRANSFER_KEY } from '../modules/tab-notes/background';
import { MODULE_FLAGS_KEY } from './module-state';
import { SITES_KEY } from '../modules/smart-replies/background';
import { EXCLUDED_KEY } from '../modules/time-tracker/background';
import { ZOMBIE_HOURS_KEY } from '../modules/zombie-tabs/zombie';
export function backupSettingKeys(): string[] { return [MODULE_FLAGS_KEY, 'enabled', 'blockedHandles', SITES_KEY, EXCLUDED_KEY, ZOMBIE_HOURS_KEY, TITLE_RULES_KEY, TRANSFER_KEY]; }
