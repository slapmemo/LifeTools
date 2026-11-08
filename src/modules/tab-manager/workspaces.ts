import { isInternalTabUrl } from '../../core/internal-tab';
import { isGroupColor, type GroupColor } from '../life-browser/tabs';

export interface WorkspaceTab { url: string; title: string; favIconUrl?: string }
export interface Workspace { id: string; name: string; color: GroupColor; tabs: WorkspaceTab[]; activeIndex: number; updatedAt: number }
export interface TabInput { id?: number; url?: string; pendingUrl?: string; title?: string; favIconUrl?: string; pinned?: boolean; active?: boolean; index?: number; groupId?: number }
export const MAX_WORKSPACES = 30;
export const MAX_TABS = 300;
export const BADGE_COLORS: Record<GroupColor, string> = { grey: '#5f6368', blue: '#1a73e8', red: '#d93025', yellow: '#f9ab00', green: '#188038', pink: '#d01884', purple: '#a142f4', cyan: '#007b83', orange: '#e8710a' };
export function workspaceTabs<T extends TabInput>(tabs: readonly T[], base: string): T[] {
  return tabs.filter(t => { const url = t.url || t.pendingUrl || ''; return !t.pinned && !isInternalTabUrl(url, base) && /^(https?:|file:|chrome:\/\/newtab\/?(?:[?#].*)?$)/i.test(url); }).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}
export function snapshot(tabs: readonly TabInput[], base: string): Pick<Workspace, 'tabs' | 'activeIndex'> {
  const selected = workspaceTabs(tabs, base).slice(0, MAX_TABS);
  return { tabs: selected.map(t => ({ url: (t.url || t.pendingUrl)!, title: t.title || '', ...(t.favIconUrl ? { favIconUrl: t.favIconUrl } : {}) })), activeIndex: Math.max(0, selected.findIndex(t => t.active)) };
}
export function validName(name: unknown): name is string { return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 100; }
export function createWorkspace(items: readonly Workspace[], name: unknown, color: unknown, id: string): Workspace {
  if (items.length >= MAX_WORKSPACES || !validName(name) || !isGroupColor(color) || !id) throw new Error('Geçersiz çalışma alanı');
  return { id, name: name.trim(), color, tabs: [], activeIndex: 0, updatedAt: Date.now() };
}
export function updateWorkspace(w: Workspace, name?: unknown, color?: unknown): Workspace {
  if (name !== undefined && !validName(name) || color !== undefined && !isGroupColor(color)) throw new Error('Geçersiz çalışma alanı');
  return { ...w, ...(name !== undefined ? { name: (name as string).trim() } : {}), ...(color !== undefined ? { color: color as GroupColor } : {}), updatedAt: Date.now() };
}
export function deleteWorkspace(items: readonly Workspace[], id: string, moveTo?: string): Workspace[] {
  const source = items.find(w => w.id === id), target = items.find(w => w.id === moveTo);
  if (!source || items.length <= 1 || (moveTo !== undefined && (!target || moveTo === id))) throw new Error('Çalışma alanı silinemedi');
  if (target && target.tabs.length + source.tabs.length > MAX_TABS) throw new Error('Sekme sınırı aşıldı');
  return items.filter(w => w.id !== id).map(w => w.id === moveTo ? { ...w, tabs: [...w.tabs, ...source.tabs], updatedAt: Date.now() } : w);
}
export function badge(w: Workspace): { text: string; color: string } { return { text: Array.from(w.name.trim())[0]?.toLocaleUpperCase('tr') || '', color: BADGE_COLORS[w.color] }; }
export function convertPlan(tabs: readonly TabInput[], groups: readonly { id: number; title?: string; color: GroupColor }[], base: string): { name: string; color: GroupColor; tabs: TabInput[] }[] {
  return groups.map((g, i) => ({ name: g.title?.trim() || `Grup ${i + 1}`, color: g.color, tabs: workspaceTabs(tabs.filter(t => t.groupId === g.id), base) }));
}
