import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTasksRepo } from './repo';

export const QUICK_TASKS_ID = 'quick-tasks';
const MENU = 'quick-tasks:add';
const repo = createTasksRepo(backgroundDb);
const recent = new Map<number, number>();

export function quickTasksMenuContributions(): ContextMenuContribution[] {
  return [
    {
      id: MENU,
      title: 'Görev olarak ekle',
      contexts: ['selection', 'page'],
      moduleId: QUICK_TASKS_ID,
      enabled: flags => resolveEnabled(flags, QUICK_TASKS_ID),
      onClick: async (info, tab) => {
        if (!(await isModuleEnabled(QUICK_TASKS_ID))) return;
        const url = info.linkUrl || info.pageUrl || tab?.url;
        const title = (info.selectionText?.trim() || info.linkUrl || tab?.title || url || '').slice(0, 300);
        try {
          await repo.add({ title, url });
          flashBadge('✓');
        } catch (err) {
          console.debug('[Hızlı Görevler] Kaydedilemedi:', err);
          flashBadge('!');
        }
      }
    }
  ];
}

export function initQuickTasksBackground(): void {
  setContextMenuContributions(QUICK_TASKS_ID, quickTasksMenuContributions());
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!sender.tab || !['quick-tasks:add', 'quick-tasks:undo'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(QUICK_TASKS_ID))) return { ok: false };
        const now = Date.now();
        for (const [id, time] of recent) if (now - time > 120_000) recent.delete(id);
        if (msg.type === 'quick-tasks:add') {
          if (typeof msg.title !== 'string' || !msg.title.trim() || msg.title.length > 300 || typeof msg.url !== 'string' || msg.url.length > 10000) return { ok: false };
          const item = await repo.add({ title: msg.title, url: msg.url }); recent.set(item.id, Date.now());
          return { ok: true, id: item.id };
        }
        if (!Number.isSafeInteger(msg.id) || !recent.has(msg.id)) return { ok: false };
        recent.delete(msg.id); await repo.delete(msg.id); return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
