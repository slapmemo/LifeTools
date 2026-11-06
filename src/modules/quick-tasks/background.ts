import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { backgroundDb } from '../../db/host';
import { createTasksRepo } from './repo';
export const QUICK_TASKS_ID = 'quick-tasks';
const MENU = 'quick-tasks:add';
const repo = createTasksRepo(backgroundDb);
let sync: Promise<void> = Promise.resolve();
function syncMenu(): void {
  sync = sync.then(async () => {
    const enabled = await isModuleEnabled(QUICK_TASKS_ID);
    await new Promise<void>(resolve => {
      const done = () => { void chrome.runtime.lastError; resolve(); };
      if (enabled) chrome.contextMenus.create({ id: MENU, title: 'Görev olarak ekle', contexts: ['page', 'selection', 'link'] }, done);
      else chrome.contextMenus.remove(MENU, done);
    });
  }).catch(err => { console.debug('[Hızlı Görevler] Menü kurulamadı:', err); });
}
export function initQuickTasksBackground(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU) return;
    void (async () => {
      if (!(await isModuleEnabled(QUICK_TASKS_ID))) return;
      const url = info.linkUrl || info.pageUrl || tab?.url;
      const title = (info.selectionText?.trim() || info.linkUrl || tab?.title || url || '').slice(0, 300);
      try { await repo.add({ title, url }); flashBadge('✓'); }
      catch (err) { console.debug('[Hızlı Görevler] Kaydedilemedi:', err); flashBadge('!'); }
    })();
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[MODULE_FLAGS_KEY]) syncMenu(); });
  chrome.runtime.onInstalled.addListener(syncMenu);
  chrome.runtime.onStartup.addListener(syncMenu);
}
