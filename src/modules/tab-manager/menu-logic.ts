import { HIDDEN_PREFIX, type Session } from '../life-browser/repo';

export interface TabMenuModel {
  groups: { id: number; title: string; current: boolean }[];
  sessions: { id: number; title: string }[];
  grouped: boolean;
  site: string;
}

export function buildTabMenuModel(groups: readonly Pick<chrome.tabGroups.TabGroup, 'id' | 'title' | 'windowId'>[], sessions: readonly Session[], tab: Pick<chrome.tabs.Tab, 'windowId' | 'groupId' | 'url' | 'pendingUrl'>, extensionBase: string, shortcutId?: number): TabMenuModel {
  const url = tab.url || tab.pendingUrl || '';
  let site = 'Yeni grup', saveable = false;
  try {
    const parsed = new URL(url);
    site = parsed.hostname.replace(/^www\./i, '') || site;
    saveable = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !url.startsWith(extensionBase || '\0');
  } catch { /* URL henüz hazır değil. */ }
  return {
    groups: groups.filter(group => group.windowId === tab.windowId).map(group => ({ id: group.id, title: group.title?.trim() || 'Adsız grup', current: group.id === tab.groupId })),
    sessions: saveable ? sessions.filter(session => session.name.startsWith(HIDDEN_PREFIX)).sort((a, b) => Number(b.id === shortcutId) - Number(a.id === shortcutId) || b.created_at - a.created_at || b.id - a.id).slice(0, 15).map(session => ({ id: session.id, title: session.name.slice(HIDDEN_PREFIX.length) })) : [],
    grouped: tab.groupId !== undefined && tab.groupId !== -1,
    site
  };
}
