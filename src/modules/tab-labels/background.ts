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

const LABELLED_KEY = 'tabLabels.labelledTabs';

async function readLabelled(): Promise<number[]> {
  try {
    const value = (await chrome.storage.session.get({ [LABELLED_KEY]: [] }))[LABELLED_KEY];
    return Array.isArray(value) ? value.filter((v): v is number => typeof v === 'number') : [];
  } catch { return []; }
}
async function writeLabelled(ids: number[]): Promise<void> {
  try { await chrome.storage.session.set({ [LABELLED_KEY]: ids }); } catch { /* Oturum deposu yoksa yok say. */ }
}

async function updateTab(tab: chrome.tabs.Tab, cleanup = false): Promise<void> {
  if (tab.id === undefined || !tab.url || !(await canInjectTabPage(tab.url))) return;
  const enabled = (await chrome.storage.local.get({ [LABEL_TITLE_KEY]: true }))[LABEL_TITLE_KEY] !== false && await isModuleEnabled(TAB_LABELS_ID);
  if (!enabled && !cleanup) return;
  const label = enabled ? (await createTabLabelsRepo(backgroundDb).get(tab.url))?.label ?? '' : '';
  const emoji = LABEL_EMOJI[label] ?? '';
  const labelled = await readLabelled();
  const wasLabelled = labelled.includes(tab.id);
  if (!emoji && !wasLabelled) return;
  await writeLabelled(emoji ? (wasLabelled ? labelled : [...labelled, tab.id]) : labelled.filter(id => id !== tab.id));
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
  chrome.tabs.onRemoved.addListener(tabId => {
    void readLabelled().then(ids => ids.includes(tabId) ? writeLabelled(ids.filter(id => id !== tabId)) : undefined);
  });
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === 'tab-labels:refresh' && !sender.tab && sender.id === chrome.runtime.id && typeof msg.url === 'string') void updateUrl(msg.url);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[LABEL_TITLE_KEY]) void chrome.tabs.query({}).then(tabs => Promise.all(tabs.map(tab => updateTab(tab, true))));
  });
}
