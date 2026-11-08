import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createWatchRepo, guessKind } from './repo';

export const WATCHLIST_ID = 'watchlist';
const MENU = 'watchlist:add';
const repo = createWatchRepo(backgroundDb);
const recent = new Map<number, number>();

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
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!sender.tab || !['watchlist:add', 'watchlist:undo'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(WATCHLIST_ID))) return { ok: false };
        const now = Date.now();
        for (const [id, time] of recent) if (now - time > 120_000) recent.delete(id);
        if (msg.type === 'watchlist:add') {
          if (typeof msg.title !== 'string' || !msg.title.trim() || msg.title.length > 300 || typeof msg.url !== 'string' || msg.url.length > 10000) return { ok: false };
          const item = await repo.add({ title: msg.title, url: msg.url, kind: 'diger' }); recent.set(item.id, Date.now());
          return { ok: true, id: item.id };
        }
        if (!Number.isSafeInteger(msg.id) || !recent.has(msg.id)) return { ok: false };
        recent.delete(msg.id); await repo.delete(msg.id); return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
