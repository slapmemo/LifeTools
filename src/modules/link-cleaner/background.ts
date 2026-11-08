import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { PAGE_THEME } from '../../core/page-theme';
import { copyOffscreen } from '../../db/host';
import { cleanUrl } from './clean';
import { AUTO_CLEAN_KEY, AUTO_CLEAN_ORIGINS, updateCleaningRules } from './rules';

export const LINK_CLEANER_ID = 'link-cleaner';
const LINK_MENU = 'link-cleaner:link';
const PAGE_MENU = 'link-cleaner:page';

async function copyCleaned(rawUrl: string, tabId?: number): Promise<void> {
  if (!(await isModuleEnabled(LINK_CLEANER_ID))) return;
  const result = cleanUrl(rawUrl);
  if (!result) {
    flashBadge('!');
    return;
  }
  try {
    if (!(await copyOffscreen(result.url))) { flashBadge('!'); return; }
    try {
      if (tabId === undefined) throw new Error('Sekme yok');
      await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [{ ok: true, title: result.removed.length ? 'Temiz link kopyalandı ✓' : 'Kaldırılacak takip parametresi yok — link kopyalandı' }, PAGE_THEME] });
    } catch { flashBadge('✓'); }
  } catch {
    flashBadge('!');
  }
}

export function linkCleanerMenuContributions(): ContextMenuContribution[] {
  return [
    {
      id: LINK_MENU,
      title: 'Temiz linki kopyala',
      contexts: ['link'],
      moduleId: LINK_CLEANER_ID,
      enabled: flags => resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => {
        await copyCleaned(info.linkUrl || '', tab?.id);
      }
    },
    {
      id: PAGE_MENU,
      title: 'Bu sayfanın temiz linki',
      contexts: ['page'],
      moduleId: LINK_CLEANER_ID,
      enabled: flags => resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => {
        await copyCleaned(info.pageUrl || tab?.url || '', tab?.id);
      }
    }
  ];
}

export function initLinkCleanerBackground(): void {
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      const data = await chrome.storage.local.get({ [AUTO_CLEAN_KEY]: false });
      const enabled = data[AUTO_CLEAN_KEY] === true && await isModuleEnabled(LINK_CLEANER_ID) && await chrome.permissions.contains({ origins: AUTO_CLEAN_ORIGINS });
      await updateCleaningRules(enabled);
    }).catch(err => { console.debug('[Link Temizleyici]', err); });
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[AUTO_CLEAN_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
  refresh();
  setContextMenuContributions(LINK_CLEANER_ID, linkCleanerMenuContributions());
}
