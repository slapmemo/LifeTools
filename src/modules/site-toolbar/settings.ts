export const TOOLBAR_SITES_KEY = 'siteToolbarSites';
export interface ToolbarSite { origin: string; actions: string[]; x?: number; y?: number }
/** Discard malformed entries and only preserve valid, explicitly allowed actions. */
export function normalizeToolbarSettings(value: unknown, allowed: readonly string[]): ToolbarSite[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: ToolbarSite[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.origin !== 'string' || !/^https?:\/\/[^/*:]+\/\*$/.test(row.origin) || seen.has(row.origin)) continue;
    try { const u = new URL(row.origin.slice(0, -1)); if (u.username || u.password || u.port || u.hostname !== u.host) continue; } catch { continue; }
    seen.add(row.origin);
    const actions = Array.isArray(row.actions) ? [...new Set(row.actions.filter((id): id is string => typeof id === 'string' && allowed.includes(id)))] : [];
    const position = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined;
    const x = position(row.x), y = position(row.y);
    result.push({ origin: row.origin, actions, ...(x === undefined ? {} : { x }), ...(y === undefined ? {} : { y }) });
  }
  return result;
}
