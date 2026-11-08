import { foldTurkish } from '../slapmemo/repo';
export interface SearchTab { title: string; url: string; label: string; note: string }
const fold = (s: string): string => foldTurkish(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
export function filterTabs<T extends SearchTab>(tabs: readonly T[], query: string): T[] { const q = fold(query.trim()); return tabs.filter(tab => fold([tab.title, tab.url, tab.label, tab.note].join(' ')).includes(q)); }

export const MRU_KEY = 'tabSwitcherMru';
export function sortByMru<T extends { id?: number }>(tabs: readonly T[], ids: readonly number[]): T[] {
  const ranks = new Map(ids.map((id, index) => [id, index]));
  return [...tabs].sort((a, b) => (ranks.get(a.id ?? -1) ?? Infinity) - (ranks.get(b.id ?? -1) ?? Infinity));
}
export function nextLabel(label: string): string {
  const labels = ['', 'Önemli', 'Sonra Bak', 'Araştırma'];
  return labels[(labels.indexOf(label) + 1) % labels.length];
}
