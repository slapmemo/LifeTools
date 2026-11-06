import { isModuleEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTabLabelsRepo } from './repo';
export const TAB_LABELS_ID = 'tab-labels';
const PARENT = 'tab-labels-menu';
const labels = ['Önemli', 'Sonra Bak', 'Araştırma'];
export function initTabLabelsBackground(): void {
  chrome.runtime.onInstalled.addListener(() => { chrome.contextMenus.create({ id: PARENT, title: 'Sekmeyi etiketle', contexts: ['page'] }); for (const label of labels) chrome.contextMenus.create({ id: PARENT + ':' + label, parentId: PARENT, title: label, contexts: ['page'] }); chrome.contextMenus.create({ id: PARENT + ':sil', parentId: PARENT, title: 'Etiketi kaldır', contexts: ['page'] }); });
  chrome.contextMenus.onClicked.addListener((info, tab) => { const id = String(info.menuItemId); if (!id.startsWith(PARENT + ':') || !tab?.url) return; void (async () => { if (!(await isModuleEnabled(TAB_LABELS_ID))) return; const label = id.slice(PARENT.length + 1); await createTabLabelsRepo(backgroundDb).set(tab.url!, label === 'sil' ? '' : label); })(); });
}
