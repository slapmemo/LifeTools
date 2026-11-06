/** Ayar: kaç saattir etkin olmayan sekme "zombi" sayılır (chrome.storage.local). */
export const ZOMBIE_HOURS_KEY = 'zombieTabsHours';
/** Sekme kimliği -> son etkin olma zamanı (ms) (chrome.storage.session). */
export const LAST_ACTIVE_KEY = 'zombieTabsLastActive';
export const DEFAULT_HOURS = 24;
const MAX_HOURS = 24 * 365;
const HOUR_MS = 3600 * 1000;

export interface ZombieTabLike { id?: number; pinned: boolean; audible?: boolean; active: boolean; lastAccessed?: number }
export interface Zombie<T extends ZombieTabLike = ZombieTabLike> { tab: T; lastActive: number }

/** Geçersiz veya eksik ayarı varsayılana (24 saat) çeker. */
export function normalizeHours(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, MAX_HOURS) : DEFAULT_HOURS;
}

/**
 * N saatten uzun süredir etkin olmayan sekmeleri seçer (en eski önce).
 * Sabit, ses çalan veya etkin sekmeler asla önerilmez. Son etkinlik bilinmiyorsa önerilmez.
 */
export function selectZombies<T extends ZombieTabLike>(tabs: readonly T[], lastActive: Readonly<Record<string, number>>, now: number, hours: number): Zombie<T>[] {
  const threshold = hours * HOUR_MS;
  const result: Zombie<T>[] = [];
  for (const tab of tabs) {
    if (tab.id === undefined || tab.pinned || tab.audible || tab.active) continue;
    const tracked = lastActive[String(tab.id)];
    const last = typeof tracked === 'number' ? tracked : tab.lastAccessed;
    if (typeof last !== 'number' || !Number.isFinite(last)) continue;
    if (now - last > threshold) result.push({ tab, lastActive: last });
  }
  return result.sort((a, b) => a.lastActive - b.lastActive);
}

/** "3 gün", "5 saat" gibi Türkçe süre metni. */
export function formatAge(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  if (hours >= 48) return `${Math.floor(hours / 24)} gün`;
  return `${hours} saat`;
}
