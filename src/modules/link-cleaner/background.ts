import { flashBadge } from '../../core/badge';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { copyOffscreen } from '../../db/host';
import { cleanUrl } from './clean';

export const LINK_CLEANER_ID = 'link-cleaner';
const LINK_MENU = 'link-cleaner:link';
const PAGE_MENU = 'link-cleaner:page';
let menuSync: Promise<void> = Promise.resolve();

function syncMenus(): Promise<void> {
  menuSync = menuSync.then(async () => {
    const enabled = await isModuleEnabled(LINK_CLEANER_ID);
    for (const [id, title, context] of [
      [LINK_MENU, 'Temiz linki kopyala', 'link'],
      [PAGE_MENU, 'Bu sayfanın temiz linkini kopyala', 'page']
    ] as const) {
      await new Promise<void>(resolve => {
        const done = () => { void chrome.runtime.lastError; resolve(); };
        if (enabled) chrome.contextMenus.create({ id, title, contexts: [context] }, done);
        else chrome.contextMenus.remove(id, done);
      });
    }
  }).catch(err => { console.debug('[Link Temizleyici] Menü hatası:', err); });
  return menuSync;
}

export function initLinkCleanerBackground(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== LINK_MENU && info.menuItemId !== PAGE_MENU) return;
    void (async () => {
      if (!(await isModuleEnabled(LINK_CLEANER_ID))) return;
      const result = cleanUrl((info.menuItemId === LINK_MENU ? info.linkUrl : info.pageUrl || tab?.url) || '');
      if (!result) { flashBadge('!'); return; }
      try { flashBadge(await copyOffscreen(result.url) ? '✓' : '!'); }
      catch { flashBadge('!'); }
    })();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MODULE_FLAGS_KEY]) void syncMenus();
  });
  chrome.runtime.onInstalled.addListener(() => { void syncMenus(); });
  chrome.runtime.onStartup.addListener(() => { void syncMenus(); });
}
