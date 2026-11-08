import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { backgroundDb } from '../../db/host';
import { createWatchRepo, guessKind } from './repo';
import { nextStatus, normalizePageUrl, PAGE_BUTTON_KEY, PAGE_ORIGINS } from './page-logic';

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
  let queue: Promise<void> = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      const data = await chrome.storage.local.get({ [PAGE_BUTTON_KEY]: false });
      const active = data[PAGE_BUTTON_KEY] === true && await isModuleEnabled(WATCHLIST_ID);
      await replaceSiteScript('watchlist-page-button', active ? PAGE_ORIGINS : [], 'watchlist-page-button.js', false);
    }).catch(err => { console.debug('[Watchlist]', err); });
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PAGE_BUTTON_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
  refresh();
  setContextMenuContributions(WATCHLIST_ID, watchlistMenuContributions());
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!sender.tab || !['watchlist:add', 'watchlist:undo', 'watchlist:status', 'watchlist:cycle'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(WATCHLIST_ID))) return { ok: false };
        const now = Date.now();
        for (const [id, time] of recent) if (now - time > 120_000) recent.delete(id);
        if (msg.type === 'watchlist:status') {
          if (typeof msg.url !== 'string' || msg.url.length > 10000) return { ok: false };
          const page = normalizePageUrl(msg.url); if (!page) return { ok: false };
          const item = (await repo.list()).find(row => row.url && normalizePageUrl(row.url)?.url === page.url);
          return item ? { ok: true, found: true, id: item.id, status: item.status } : { ok: true, found: false };
        }
        if (msg.type === 'watchlist:cycle') {
          if (!Number.isSafeInteger(msg.id) || msg.id <= 0) return { ok: false };
          const item = (await repo.list()).find(row => row.id === msg.id);
          if (!item) return { ok: false };
          const updated = await repo.setStatus(item.id, nextStatus(item.status));
          return updated ? { ok: true, status: updated.status } : { ok: false };
        }
        if (msg.type === 'watchlist:add') {
          if (typeof msg.title !== 'string' || !msg.title.trim() || msg.title.length > 300 || typeof msg.url !== 'string' || msg.url.length > 10000 || (msg.kind !== undefined && !['film', 'dizi', 'video', 'diger'].includes(msg.kind))) return { ok: false };
          const item = await repo.add({ title: msg.title, url: msg.url, kind: msg.kind ?? 'diger' }); recent.set(item.id, Date.now());
          return { ok: true, id: item.id };
        }
        if (!Number.isSafeInteger(msg.id) || !recent.has(msg.id)) return { ok: false };
        recent.delete(msg.id); await repo.delete(msg.id); return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
