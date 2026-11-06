import { foldTurkish } from '../slapmemo/repo';
export interface SearchTab { title: string; url: string; label: string; note: string }
const fold = (s: string): string => foldTurkish(s).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
export function filterTabs<T extends SearchTab>(tabs: readonly T[], query: string): T[] { const q = fold(query.trim()); return tabs.filter(tab => fold([tab.title, tab.url, tab.label, tab.note].join(' ')).includes(q)); }
