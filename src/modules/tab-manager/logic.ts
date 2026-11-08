import { GROUP_COLORS } from '../life-browser/tabs';

export const COLORS = GROUP_COLORS.map((color, i) => ({ color, label: ['Gri', 'Mavi', 'Kırmızı', 'Sarı', 'Yeşil', 'Pembe', 'Mor', 'Camgöbeği', 'Turuncu'][i] }));
export interface ViewTab { id?: number; windowId: number; index: number; groupId: number; url?: string; pendingUrl?: string; title?: string }
export interface ViewGroup { id: number; windowId: number }
export function buildViewModel<T extends ViewTab, G extends ViewGroup>(tabs: readonly T[], groups: readonly G[], ownUrl: string, currentWindowId?: number) {
  const windows = new Map<number, T[]>();
  for (const tab of tabs) {
    if (tab.id === undefined || (tab.url || tab.pendingUrl || '').split('?')[0] === ownUrl) continue;
    const list = windows.get(tab.windowId) ?? []; list.push(tab); windows.set(tab.windowId, list);
  }
  return [...windows].sort(([a], [b]) => a === currentWindowId ? -1 : b === currentWindowId ? 1 : 0).map(([id, list]) => {
    list.sort ( (a, b) => a.index - b.index );
    const cards: { group: G; tabs: T[] }[] = [];
    const ungrouped: T[] = [];
    for (const tab of list) {
      const group = groups.find(g => g.id === tab.groupId && g.windowId === id);
      if (!group) { ungrouped.push(tab); continue; }
      let card = cards.find(c => c.group.id === group.id);
      if (!card) { card = { group, tabs: [] }; cards.push(card); }
      card.tabs.push(tab);
    }
    return { id, tabs: list, groups: cards, ungrouped };
  });
}
export function selectRange(ids: readonly number[], anchor: number | undefined, target: number, selected: ReadonlySet<number>, checked: boolean): Set<number> {
  const result = new Set(selected), a = anchor === undefined ? -1 : ids.indexOf(anchor), b = ids.indexOf(target);
  const range = a < 0 || b < 0 ? [target] : ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  for (const id of range) checked ? result.add(id) : result.delete(id);
  return result;
}
