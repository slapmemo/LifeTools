import { foldSearch } from '../command-center/search';
import { BADGE_COLORS, type Workspace } from './workspaces';

export interface WorkspaceState { mode: 'groups' | 'workspaces'; workspaces: (Workspace & { count: number })[]; activeByWindow: Record<string, string> }
export function pills(items: WorkspaceState['workspaces'], active?: string) { return items.map(w => ({ ...w, active: w.id === active, hex: BADGE_COLORS[w.color] })); }
export function workspaceForKey<T>(items: readonly T[], key: string): T | undefined { return /^[1-9]$/.test(key) ? items[Number(key) - 1] : undefined; }
export function matchWorkspaces<T extends { name: string }>(items: readonly T[], query: string): T[] {
  const q = foldSearch(query.trim());
  return items.map((item, index) => { const name = foldSearch(item.name); let i = 0; for (const c of name) if (c === q[i]) i++; return { item, index, score: !q || name.startsWith(q) ? 0 : name.includes(q) ? 1 : i === q.length ? 2 : Infinity }; }).filter(x => Number.isFinite(x.score)).sort((a,b) => a.score - b.score || a.index - b.index).map(x => x.item);
}
export async function ws<T = Record<string, never>>(message: Record<string, unknown>): Promise<T> {
  const result = await chrome.runtime.sendMessage(message) as T & { ok: boolean; error?: string };
  if (!result?.ok) throw new Error(result?.error || 'İşlem başarısız oldu.');
  return result;
}
