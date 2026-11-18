import { extensionBaseUrl, isInternalTabUrl } from './internal-tab';

type TabLike = { id?: number; url?: string; pendingUrl?: string; lastAccessed?: number; active?: boolean };

/**
 * Panel ayrı bir sekmede açık olduğu için "etkin sekme" panelin kendisidir.
 * Hedef olarak aynı penceredeki, eklentiye ait olmayan, en son kullanılan sekmeyi seçer.
 */
export function pickTargetTab<T extends TabLike>(tabs: T[], extensionBase: string, selfTabId?: number): T | undefined {
  const candidates = tabs.filter(tab => tab.id !== undefined && tab.id !== selfTabId && !isInternalTabUrl(tab.url || tab.pendingUrl, extensionBase));
  if (candidates.length === 0) return undefined;
  return candidates.reduce((best, tab) => {
    const a = best.lastAccessed ?? (best.active ? Number.MAX_SAFE_INTEGER : 0);
    const b = tab.lastAccessed ?? (tab.active ? Number.MAX_SAFE_INTEGER : 0);
    return b > a ? tab : best;
  });
}

/** Panelden işlem yapılacak sekme: aynı penceredeki son kullanılan uzantı dışı sekme. */
export async function getPanelTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const self = await chrome.tabs.getCurrent().catch(() => undefined);
  const tabs = self?.windowId !== undefined
    ? await chrome.tabs.query({ windowId: self.windowId })
    : await chrome.tabs.query({ currentWindow: true });
  return pickTargetTab(tabs, extensionBaseUrl(), self?.id);
}
