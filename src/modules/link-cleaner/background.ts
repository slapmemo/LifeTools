import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { copyOffscreen } from '../../db/host';
import { cleanUrl } from './clean';

export const LINK_CLEANER_ID = 'link-cleaner';
const LINK_MENU = 'link-cleaner:link';
const PAGE_MENU = 'link-cleaner:page';

async function copyCleaned(rawUrl: string): Promise<void> {
  if (!(await isModuleEnabled(LINK_CLEANER_ID))) return;
  const result = cleanUrl(rawUrl);
  if (!result) {
    flashBadge('!');
    return;
  }
  try {
    flashBadge((await copyOffscreen(result.url)) ? '✓' : '!');
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
      onClick: async info => {
        await copyCleaned(info.linkUrl || '');
      }
    },
    {
      id: PAGE_MENU,
      title: 'Bu sayfanın temiz linki',
      contexts: ['page'],
      moduleId: LINK_CLEANER_ID,
      enabled: flags => resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => {
        await copyCleaned(info.pageUrl || tab?.url || '');
      }
    }
  ];
}

export function initLinkCleanerBackground(): void {
  setContextMenuContributions(LINK_CLEANER_ID, linkCleanerMenuContributions());
}
