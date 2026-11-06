import { normalizeHandleList } from './rules';

export interface BlockerSettings {
  enabled: boolean;
  blockedHandles: string[];
}

export async function loadSettings(): Promise<BlockerSettings> {
  const data = await chrome.storage.local.get({ enabled: true, blockedHandles: [] });
  return {
    enabled: data.enabled !== false,
    blockedHandles: normalizeHandleList(data.blockedHandles)
  };
}
