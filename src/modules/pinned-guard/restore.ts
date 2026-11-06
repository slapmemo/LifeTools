import { CLOSED_KEY, readClosed, type ClosedPinned } from './guard';

export async function loadClosed(): Promise<ClosedPinned[]> {
  return readClosed((await chrome.storage.local.get({ [CLOSED_KEY]: [] }))[CLOSED_KEY]);
}

export async function removeClosed(key: string): Promise<void> {
  const list = await loadClosed();
  await chrome.storage.local.set({ [CLOSED_KEY]: list.filter(item => item.key !== key) });
}

async function targetWindow(windowId: number): Promise<number | undefined> {
  try { const win = await chrome.windows.get(windowId); if (win.type === 'normal' && win.id !== undefined) return win.id; } catch { /* Pencere kapanmış. */ }
  try { const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }); if (win.id !== undefined) return win.id; } catch { /* Normal pencere yok. */ }
  return undefined;
}

/** Kapanan sabit sekmeyi kendi penceresinde (yoksa son odaklı pencerede) 0. sıraya sabit olarak geri açar. */
export async function reopenPinned(entry: ClosedPinned): Promise<void> {
  const windowId = await targetWindow(entry.windowId);
  if (windowId !== undefined) {
    await chrome.tabs.create({ windowId, url: entry.url, pinned: true, index: 0, active: true });
  } else {
    const win = await chrome.windows.create({ url: entry.url, focused: true });
    const tabId = win?.tabs?.[0]?.id;
    if (tabId !== undefined) await chrome.tabs.update(tabId, { pinned: true });
  }
  await removeClosed(entry.key);
}
