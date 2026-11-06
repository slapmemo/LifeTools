import type { SiteTotal } from '../modules/time-tracker/repo';
export function formatTasks(count: number, overdue: number): string { return `${count} açık görev${overdue ? ` (${overdue} gecikmiş)` : ''}`; }
export function formatSites(sites: SiteTotal[]): string { return sites.length ? sites.slice(0,3).map(s => `${s.domain} ${Math.max(1,Math.round(s.seconds / 60))} dk`).join(' · ') : 'Bugün site süresi yok'; }
