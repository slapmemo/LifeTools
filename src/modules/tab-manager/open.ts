import { isManagerTabUrl } from './manager-tab';
export async function openTabManager(windowId?: number): Promise<void> {
  const url = chrome.runtime.getURL('tabs.html');
  const tabs = await chrome.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
  // Yönetici'ye yönlenmekte olan sekmede `url` hâlâ eski adres olabilir; ikisine ayrı bak.
  const existing = tabs.find(tab => isManagerTabUrl(tab.url, url) || isManagerTabUrl(tab.pendingUrl, url));
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url, ...(windowId === undefined ? {} : { windowId }) });
}
