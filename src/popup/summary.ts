import type { SiteTotal } from '../modules/time-tracker/repo';
import { formatDuration } from '../modules/time-tracker/panel';
export function formatTasks(count: number, overdue: number): string { return `${count} açık görev${overdue ? ` (${overdue} gecikmiş)` : ''}`; }
export function formatSites(sites: SiteTotal[]): string { return sites.length ? sites.slice(0,3).map(s => `${s.domain} ${Math.max(1,Math.round(s.seconds / 60))} dk`).join(' · ') : 'Bugün site süresi yok'; }
export function todayTimeLine(sites: SiteTotal[]): string {
  if (!sites.length) return 'Bugün henüz süre kaydı yok';
  const total = sites.reduce((sum, site) => sum + site.seconds, 0);
  const top = sites.reduce((a, b) => b.seconds > a.seconds ? b : a);
  return `Bugün: ${formatDuration(total)} · en çok ${top.domain} (${formatDuration(top.seconds)})`;
}
