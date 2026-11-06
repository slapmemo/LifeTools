import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createWatchRepo, guessKind } from './repo';

export const WATCHLIST_ID = 'watchlist';
const MENU = 'watchlist:add';
const repo = createWatchRepo(backgroundDb);

export function watchlistMenuContributions(): ContextMenuContribution[] {
  return [
    {
      id: MENU,
      title: 'İzleme listesine ekle',
      contexts: ['link', 'page'],
      moduleId: WATCHLIST_ID,
      enabled: flags => resolveEnabled(flags, WATCHLIST_ID),
      onClick: async (info, tab) => {
        if (!(await isModuleEnabled(WATCHLIST_ID))) return;
        const url = info.linkUrl || info.pageUrl || tab?.url || '';
        let title = tab?.title || url;
        if (info.linkUrl && tab?.id !== undefined) {
          try {
            const r = await chrome.scripting.executeScript({
              target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
              args: [info.linkUrl],
              func: (linkHref: string) =>
                Array.from(document.querySelectorAll('a')).find(a => a.href === linkHref)?.textContent?.trim() || ''
            });
            title = r[0]?.result || info.linkUrl;
          } catch {
            title = info.linkUrl;
          }
        }
        try {
          await repo.add({ title: title.slice(0, 300), kind: guessKind(url), url });
          flashBadge('✓');
        } catch {
          flashBadge('!');
        }
      }
    }
  ];
}

export function initWatchlistBackground(): void {
  setContextMenuContributions(WATCHLIST_ID, watchlistMenuContributions());
}
