import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTasksRepo } from './repo';

export const QUICK_TASKS_ID = 'quick-tasks';
const MENU = 'quick-tasks:add';
const repo = createTasksRepo(backgroundDb);

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
}
