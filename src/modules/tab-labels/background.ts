import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTabLabelsRepo } from './repo';

export const TAB_LABELS_ID = 'tab-labels';
const PARENT = 'tab-labels-menu';
export const PRESET_TAB_LABELS = ['Önemli', 'Sonra Bak', 'Araştırma'] as const;

export function tabLabelsMenuContributions(): ContextMenuContribution[] {
  const items: ContextMenuContribution[] = [
    {
      id: PARENT,
      title: 'Sekmeyi etiketle',
      contexts: ['page'],
      moduleId: TAB_LABELS_ID,
      enabled: flags => resolveEnabled(flags, TAB_LABELS_ID)
    }
  ];

  for (const label of PRESET_TAB_LABELS) {
    items.push({
      id: `${PARENT}:${label}`,
      parent: PARENT,
      title: label,
      contexts: ['page'],
      moduleId: TAB_LABELS_ID,
      enabled: flags => resolveEnabled(flags, TAB_LABELS_ID),
      onClick: async (_info, tab) => {
        if (!tab?.url || !(await isModuleEnabled(TAB_LABELS_ID))) return;
        await createTabLabelsRepo(backgroundDb).set(tab.url, label);
      }
    });
  }

  items.push({
    id: `${PARENT}:sil`,
    parent: PARENT,
    title: 'Etiketi kaldır',
    contexts: ['page'],
    moduleId: TAB_LABELS_ID,
    enabled: flags => resolveEnabled(flags, TAB_LABELS_ID),
    onClick: async (_info, tab) => {
      if (!tab?.url || !(await isModuleEnabled(TAB_LABELS_ID))) return;
      await createTabLabelsRepo(backgroundDb).set(tab.url, '');
    }
  });

  return items;
}

export function initTabLabelsBackground(): void {
  setContextMenuContributions(TAB_LABELS_ID, tabLabelsMenuContributions());
}
