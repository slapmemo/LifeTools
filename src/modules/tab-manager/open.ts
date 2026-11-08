export async function openTabManager(windowId?: number): Promise<void> {
  const url = chrome.runtime.getURL('tabs.html');
  const tabs = await chrome.tabs.query(windowId === undefined ? { currentWindow: true } : { windowId });
  const existing = tabs.find(tab => (tab.url || tab.pendingUrl) === url);
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else await chrome.tabs.create({ url, ...(windowId === undefined ? {} : { windowId }) });
}
