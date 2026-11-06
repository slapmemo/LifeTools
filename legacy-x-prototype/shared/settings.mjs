import { normalizeHandleList } from './rules.mjs';

export async function loadSettings() {
  const data = await chrome.storage.local.get({ enabled: true, blockedHandles: [] });
  return {
    enabled: data.enabled !== false,
    blockedHandles: normalizeHandleList(data.blockedHandles)
  };
}
