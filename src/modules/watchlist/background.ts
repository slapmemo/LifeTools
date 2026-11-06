import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { backgroundDb } from '../../db/host';
import { createWatchRepo, guessKind } from './repo';
export const WATCHLIST_ID = 'watchlist';
const menu = 'watchlist:add'; const repo = createWatchRepo(backgroundDb);
function sync(): void { void (async () => { await new Promise<void>(r => chrome.contextMenus.remove(menu, () => { void chrome.runtime.lastError; r(); })); if (await isModuleEnabled(WATCHLIST_ID)) chrome.contextMenus.create({ id: menu, title: 'İzleme listesine ekle', contexts: ['page','link'] }, () => { void chrome.runtime.lastError; }); })(); }
export function initWatchlistBackground(): void {
 chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId !== menu) return; void (async () => { if (!await isModuleEnabled(WATCHLIST_ID)) return; const url = info.linkUrl || info.pageUrl || tab?.url || ''; let title = tab?.title || url; if (info.linkUrl && tab?.id !== undefined) { try { const r = await chrome.scripting.executeScript({ target: {tabId: tab.id, frameIds: [info.frameId ?? 0]}, args: [info.linkUrl], func: (url: string) => Array.from(document.querySelectorAll('a')).find(a => a.href === url)?.textContent?.trim() || '' }); title = r[0]?.result || info.linkUrl; } catch { title = info.linkUrl; } } try { await repo.add({ title: title.slice(0,300), kind: guessKind(url), url }); flashBadge('✓'); } catch { flashBadge('!'); } })(); });
 chrome.storage.onChanged.addListener((c,a) => { if (a === 'local' && c[MODULE_FLAGS_KEY]) sync(); }); chrome.runtime.onInstalled.addListener(sync); chrome.runtime.onStartup.addListener(sync); sync();
}
