import { siteKey } from '../time-tracker/tracker';
import { GROUP_COLORS } from '../life-browser/tabs';
import { AUTO_PREFIX, HIDDEN_PREFIX, type Session, type SessionTab } from '../life-browser/repo';

export { HIDDEN_PREFIX };
export function hiddenGroupModel(session: Session, tabs: readonly SessionTab[]) {
  if (!session.name.startsWith(HIDDEN_PREFIX) || !tabs.length || tabs[0].group_title === null || !tabs.every(tab => tab.group_title === tabs[0].group_title)) return undefined;
  return { id: session.id, name: session.name.slice(HIDDEN_PREFIX.length), color: tabs[0].group_color || 'grey', count: tabs.length };
}

export function hiddenTabModel(tab: Pick<SessionTab, 'url' | 'title'>) {
  let host: string;
  try { host = new URL(tab.url).host; } catch { host = tab.url; }
  return { title: tab.title || tab.url, host };
}

export function hiddenGroupCollapsed(stored: string | null, groupCount: number): boolean {
  return stored === 'true' ? true : stored === 'false' ? false : groupCount > 3;
}

/** "Kayıtlı gruplar" kartı: gizli gruplar ve normal oturumlar aynı modelle gösterilir. */
export interface SavedCardModel { id: number; kind: 'hidden' | 'session'; name: string; color: string | null; count: number; auto: boolean; createdAt: number }
export function savedCardModel(session: Session, tabs: readonly SessionTab[]): SavedCardModel {
  const hidden = hiddenGroupModel(session, tabs);
  if (hidden) return { id: session.id, kind: 'hidden', name: hidden.name, color: hidden.color, count: hidden.count, auto: false, createdAt: session.created_at };
  return { id: session.id, kind: 'session', name: session.name, color: null, count: tabs.length, auto: session.name.startsWith(AUTO_PREFIX), createdAt: session.created_at };
}

/** Yeniden adlandırmada saklanacak tam oturum adı (gizli gruplarda önek korunur). */
export function savedStoredName(kind: SavedCardModel['kind'], input: string): string {
  return kind === 'hidden' ? HIDDEN_PREFIX + input.trim() : input.trim();
}

/** Gizli grup açılırken sekmelerin grup başlığı, kartta görünen adla eşitlenir. */
export function hiddenOpenTabs<T extends Pick<SessionTab, 'group_title'>>(tabs: readonly T[], name: string): T[] {
  return tabs.map(tab => ({ ...tab, group_title: name === 'Adsız grup' && tab.group_title === '' ? '' : name }));
}

const normalizeQuery = (value: string): string => value.trim().toLocaleLowerCase('tr-TR');
/** Metin, aramayla (Türkçe küçük harf, boşluk kırpılmış) eşleşiyor mu? Boş arama her şeyle eşleşir. */
export function matchesQuery(text: string, query: string): boolean {
  const q = normalizeQuery(query);
  return !q || text.toLocaleLowerCase('tr-TR').includes(q);
}

/**
 * Kayıtlı grubu aramaya göre süzer: grup adı eşleşirse tüm sekmeler, değilse yalnızca
 * başlığı/adresi eşleşen sekmeler gösterilir. `expand`: arama sürerken eşleşen grup açılır.
 */
export function filterSavedGroup<T extends Pick<SessionTab, 'url' | 'title'> & { note?: string | null }>(name: string, tabs: readonly T[], query: string): { visible: boolean; expand: boolean; tabs: readonly T[] } {
  if (!normalizeQuery(query)) return { visible: true, expand: false, tabs };
  if (matchesQuery(name, query)) return { visible: true, expand: true, tabs };
  const hits = tabs.filter(tab => matchesQuery(`${tab.title || ''} ${tab.url} ${tab.note || ''}`, query));
  return { visible: hits.length > 0, expand: hits.length > 0, tabs: hits };
}

/** "Gruba ekle" etiketleri: aynı ad birden çok pencerede varsa " · Pencere N" eklenir. */
export function groupTargetLabels<G extends { id: number; windowId: number; title?: string }>(groups: readonly G[], windowNumber: (windowId: number) => number | undefined): { group: G; label: string }[] {
  const nameOf = (g: G): string => g.title?.trim() || 'Adsız grup';
  const windowsByName = new Map<string, Set<number>>();
  for (const g of groups) { const set = windowsByName.get(nameOf(g)) ?? new Set<number>(); set.add(g.windowId); windowsByName.set(nameOf(g), set); }
  return groups.map(group => {
    const name = nameOf(group), number = windowNumber(group.windowId);
    return { group, label: (windowsByName.get(name)?.size ?? 0) > 1 && number !== undefined ? `${name} · Pencere ${number}` : name };
  });
}

/** Yeni grup adı boşsa varsayılan ad. */
export function newGroupTitle(input: string): string { return input.trim() || 'Yeni grup'; }

/** Kaydedilebilir ve kaydedilemez (iç/adres yok) sekmeleri ayırır. */
export function partitionSaveable<T extends { id?: number; url?: string; pendingUrl?: string }>(tabs: readonly T[], isBlocked: (url: string) => boolean): { saveable: (T & { id: number; savedUrl: string })[]; skipped: T[] } {
  const saveable: (T & { id: number; savedUrl: string })[] = [], skipped: T[] = [];
  for (const tab of tabs) {
    const url = tab.url || tab.pendingUrl;
    if (tab.id === undefined || !url || isBlocked(url)) skipped.push(tab);
    else saveable.push({ ...tab, id: tab.id, savedUrl: url });
  }
  return { saveable, skipped };
}

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

export type DragSource = { kind: 'open'; windowId: number; groupId: number } | { kind: 'saved'; sessionId: number };
export type DropTarget = { kind: 'open'; windowId: number; groupId: number; rowIndex?: number } | { kind: 'saved'; sessionId: number; rowIndex?: number };
export function dropAction(source: DragSource, target: DropTarget): 'none' | 'reorder' | 'open-to-open' | 'open-to-saved' | 'saved-to-open' | 'saved-to-saved' {
  if (source.kind === 'saved') return target.kind === 'saved' ? (source.sessionId === target.sessionId ? 'none' : 'saved-to-saved') : 'saved-to-open';
  if (target.kind === 'saved') return 'open-to-saved';
  if (source.windowId === target.windowId && source.groupId === target.groupId) return target.rowIndex === undefined ? 'none' : 'reorder';
  return 'open-to-open';
}

/** Pointer movement and placement helpers for tab dragging. */
export function dragThresholdExceeded(startX: number, startY: number, x: number, y: number): boolean { return Math.hypot(x - startX, y - startY) > 5; }
export function insertionPosition(y: number, rect: { top: number; height: number }): 'before' | 'after' { return y < rect.top + rect.height / 2 ? 'before' : 'after'; }
export function autoScrollSpeed(y: number, viewportHeight: number): number {
  const edge = 60, max = 18;
  if (y < edge) return -max * Math.min(1, (edge - y) / edge);
  if (y > viewportHeight - edge) return max * Math.min(1, (y - (viewportHeight - edge)) / edge);
  return 0;
}

export type SavedSort = 'date' | 'manual' | 'site';
export function sortSavedGroups<T extends { id: number; created_at: number }>(groups: readonly T[], mode: SavedSort, manualOrder: readonly number[]): T[] {
  const date = (a: T, b: T): number => b.created_at - a.created_at || b.id - a.id;
  if (mode === 'date') return [...groups].sort(date);
  const ranks = new Map(manualOrder.map((id, i) => [id, i]));
  return [...groups].sort((a, b) => (ranks.get(a.id) ?? -1) - (ranks.get(b.id) ?? -1) || date(a, b));
}
export function sortSavedTabs<T extends { id: number; position: number }>(tabs: readonly T[], mode: SavedSort): T[] {
  return [...tabs].sort((a, b) => mode === 'manual' ? a.position - b.position || a.id - b.id : a.id - b.id);
}
export function siteLabel(host: string): string {
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be') return 'YouTube';
  if (host === 'x.com' || host === 'twitter.com') return 'X';
  if (/^google\.[a-z.]+$/i.test(host)) return 'Google';
  return host || 'Diğer';
}
export function clusterBySite<T extends { id: number; url: string }>(tabs: readonly T[]): { key: string; host: string; label: string; tabs: T[] }[] {
  const clusters = new Map<string, { key: string; host: string; label: string; tabs: T[] }>();
  for (const tab of [...tabs].sort((a, b) => a.id - b.id)) {
    const host = siteKey(tab.url) || '';
    const label = siteLabel(host);
    const key = label === 'YouTube' ? 'youtube.com' : label === 'X' ? 'x.com' : label === 'Google' ? 'google.com' : host;
    const cluster = clusters.get(key) ?? { key, host, label, tabs: [] };
    cluster.tabs.push(tab); clusters.set(key, cluster);
  }
  return [...clusters.values()].sort((a, b) => !a.host ? 1 : !b.host ? -1 : b.tabs.length - a.tabs.length || a.label.localeCompare(b.label, 'tr'));
}

/** Kullanıcı sırası önce, yeni siteler sekme sayısı ve ada göre; Diğer varsayılan olarak son. */
export function orderClusters<T extends { key: string; label: string; tabs: readonly unknown[] }>(clusters: readonly T[], savedOrder: readonly string[]): T[] {
  const ranks = new Map<string, number>();
  savedOrder.forEach((key, index) => { if (!ranks.has(key)) ranks.set(key, index); });
  return [...clusters].sort((a, b) => {
    const ar = ranks.get(a.key), br = ranks.get(b.key);
    if (ar !== undefined || br !== undefined) return (ar ?? Infinity) - (br ?? Infinity);
    if (!a.key || !b.key) return Number(!a.key) - Number(!b.key);
    return b.tabs.length - a.tabs.length || a.label.localeCompare(b.label, 'tr');
  });
}

export function exportPlain(name: string, tabs: readonly Pick<SessionTab, 'title' | 'url' | 'note'>[]): string {
  return `${name}\n\n${tabs.map(tab => `${tab.title || tab.url} — ${tab.url}${tab.note ? `\n  Not: ${tab.note}` : ''}`).join('\n')}`;
}
export function exportMarkdown(name: string, tabs: readonly Pick<SessionTab, 'title' | 'url' | 'note'>[]): string {
  return `## ${name}\n\n${tabs.map(tab => `- [${(tab.title || tab.url).replace(/[\[\]()]/g, '\\$&')}](${tab.url})${tab.note ? ` — ${tab.note}` : ''}`).join('\n')}`;
}
export function resolveShortcutTarget(sessions: readonly Session[], storedId: unknown): Session | undefined {
  return sessions.find(s => s.id === storedId) ?? [...sessions].filter(s => s.name === HIDDEN_PREFIX + 'Sonra').sort((a, b) => b.created_at - a.created_at || b.id - a.id)[0];
}
