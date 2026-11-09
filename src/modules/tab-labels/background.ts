import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTabLabelsRepo } from './repo';
import { canInjectTabPage } from '../../core/tab-page-permission';
import { normalizeUrl } from '../life-browser/tabs';
import { LABEL_EMOJI } from './title-logic';
import { applyLabelTitle } from './title-page';

export const TAB_LABELS_ID = 'tab-labels';
const PARENT = 'tab-labels-menu';
export const PRESET_TAB_LABELS = ['Önemli', 'Sonra Bak', 'Araştırma'] as const;
export const LABEL_TITLE_KEY = 'tabLabelsShowInTitle';

async function updateTab(tab: chrome.tabs.Tab, cleanup = false): Promise<void> {
  if (tab.id === undefined || !tab.url || !(await canInjectTabPage(tab.url))) return;
  const enabled = (await chrome.storage.local.get({ [LABEL_TITLE_KEY]: true }))[LABEL_TITLE_KEY] !== false && await isModuleEnabled(TAB_LABELS_ID);
  if (!enabled && !cleanup) return;
  const label = enabled ? (await createTabLabelsRepo(backgroundDb).get(tab.url))?.label ?? '' : '';
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: applyLabelTitle, args: [LABEL_EMOJI[label] ?? '', Object.values(LABEL_EMOJI)] }); } catch { /* Sayfa artık kullanılabilir olmayabilir. */ }
}
async function updateUrl(url: string): Promise<void> {
  for (const tab of await chrome.tabs.query({})) if (tab.url && normalizeUrl(tab.url) === normalizeUrl(url)) await updateTab(tab);
}

export function tabLabelsMenuContributions(): ContextMenuContribution[] {
  const items: ContextMenuContribution[] = [];

  for (const label of PRESET_TAB_LABELS) {
    items.push({
      id: `${PARENT}:${label}`,
      title: `Etiket: ${label}`,
      contexts: ['page'],
      moduleId: TAB_LABELS_ID,
      enabled: flags => resolveEnabled(flags, TAB_LABELS_ID),
      onClick: async (_info, tab) => {
        if (!tab?.url || !(await isModuleEnabled(TAB_LABELS_ID))) return;
        await createTabLabelsRepo(backgroundDb).set(tab.url, label);
        await updateUrl(tab.url);
      }
    });
  }

  items.push({
    id: `${PARENT}:sil`,
    title: 'Etiketi kaldır',
    contexts: ['page'],
    moduleId: TAB_LABELS_ID,
    enabled: flags => resolveEnabled(flags, TAB_LABELS_ID),
    onClick: async (_info, tab) => {
      if (!tab?.url || !(await isModuleEnabled(TAB_LABELS_ID))) return;
      await createTabLabelsRepo(backgroundDb).set(tab.url, '');
      await updateUrl(tab.url);
    }
  });

  return items;
}

export function initTabLabelsBackground(): void {
  setContextMenuContributions(TAB_LABELS_ID, tabLabelsMenuContributions());
  chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (change.status === 'complete') void updateTab(tab); });
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'tab-labels:refresh' && !sender.tab && sender.id === chrome.runtime.id && typeof msg.url === 'string') void updateUrl(msg.url);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LABEL_TITLE_KEY]) void chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => updateTab(tab, true))));
  });
}
