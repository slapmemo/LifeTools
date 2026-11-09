import { siteKey } from '../time-tracker/tracker';
import { extensionBaseUrl, isInternalTabUrl } from '../../core/internal-tab';

/** chrome.tabs.Tab'ın bu modülde kullanılan alt kümesi (saf fonksiyonlar için). */
export interface TabLike { id?: number; url?: string; title?: string; pinned: boolean; groupId?: number; index?: number }
export interface GroupInfo { title: string | null; color: string | null }
export interface SessionTabInput { url: string; title: string | null; pinned: boolean; group_title: string | null; group_color: string | null }
export interface GroupPlan { site: string; tabIds: number[] }
export interface DuplicateSet { url: string; keep: number; close: number[] }

/** Chrome'un tabGroups renkleri. */
export const GROUP_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type GroupColor = typeof GROUP_COLORS[number];
export function isGroupColor(value: unknown): value is GroupColor { return typeof value === 'string' && (GROUP_COLORS as readonly string[]).includes(value); }

const NO_GROUP = -1;
const ungrouped = (tab: TabLike): boolean => tab.groupId === undefined || tab.groupId === NO_GROUP;

/**
 * "Siteye göre grupla" planı: sabitlenmemiş ve gruba girmemiş sekmeleri siteye (www'siz alan adı)
 * göre toplar; yalnızca en az 2 sekmesi olan siteler için grup önerir. Sıra, ilk sekmenin sırasıdır.
 */
export function planGroupsBySite(tabs: readonly TabLike[]): GroupPlan[] {
  const bySite = new Map<string, number[]>();
  for (const tab of tabs) {
    if (tab.id === undefined || tab.pinned || isInternalTabUrl(tab.url, extensionBaseUrl()) || !ungrouped(tab)) continue;
    const site = siteKey(tab.url ?? null);
    if (!site) continue;
    const ids = bySite.get(site);
    if (ids) ids.push(tab.id); else bySite.set(site, [tab.id]);
  }
  return [...bySite].filter(([, ids]) => ids.length >= 2).map(([site, tabIds]) => ({ site, tabIds }));
}

/** Karşılaştırma için URL: #hash kısmı yok sayılır. */
export function normalizeUrl(url: string): string {
  try { const u = new URL(url); u.hash = ''; return u.href; } catch { return url.split('#')[0]; }
}

/** Aynı URL'ye (hash hariç) sahip sekmeler; ilki tutulur. Sabit sekmeler hiçbir zaman kapatılmaz. */
export function findDuplicates(tabs: readonly TabLike[]): DuplicateSet[] {
  const byUrl = new Map<string, TabLike[]>();
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url || isInternalTabUrl(tab.url, extensionBaseUrl())) continue;
    const key = normalizeUrl(tab.url);
    const list = byUrl.get(key);
    if (list) list.push(tab); else byUrl.set(key, [tab]);
  }
  const result: DuplicateSet[] = [];
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    const close = list.slice(1).filter(tab => !tab.pinned).map(tab => tab.id as number);
    if (close.length) result.push({ url, keep: list[0].id as number, close });
  }
  return result;
}

/** Pencere sekmelerini oturum kaydına çevirir (URL'si olmayanlar atlanır). */
export function toSessionTabs(tabs: readonly TabLike[], groups: ReadonlyMap<number, GroupInfo>): SessionTabInput[] {
  return [...tabs].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).filter(tab => !!tab.url && !isInternalTabUrl(tab.url, extensionBaseUrl())).map(tab => {
    const group = !ungrouped(tab) ? groups.get(tab.groupId as number) : undefined;
    return { url: tab.url as string, title: tab.title || null, pinned: tab.pinned, group_title: group ? group.title ?? '' : null, group_color: group?.color ?? null };
  });
}
