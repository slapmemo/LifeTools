export interface Chunk { day: string; domain: string; seconds: number }
export interface TrackerState { focused: boolean; idle: 'active' | 'idle' | 'locked'; domain: string | null; segment: { domain: string; startMs: number } | null }
export type Event = { type: 'activeUrl'; url: string | null } | { type: 'windowFocus'; focused: boolean } | { type: 'idle'; idle: TrackerState['idle'] } | { type: 'flush' };
export const initialState = (): TrackerState => ({ focused: false, idle: 'idle', domain: null, segment: null });
export function siteKey(url: string | null): string | null {
  if (!url) return null;
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase().replace(/^www\./, '') || null : null; } catch { return null; }
}
export function localDay(ms: number): string { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
// Calendar construction, rather than adding 24 hours, respects daylight-saving changes.
export function splitByDay(domain: string, startMs: number, endMs: number, day: (ms: number) => string = localDay): Chunk[] {
  const chunks: Chunk[] = []; let cursor = startMs;
  while (cursor < endMs) {
    const current = day(cursor); let lo = cursor + 1, hi = endMs;
    if (day(hi - 1) === current) lo = hi;
    else { while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (day(mid) === current) lo = mid + 1; else hi = mid; } }
    const seconds = Math.floor((lo - cursor) / 1000); if (seconds > 0) chunks.push({ day: current, domain, seconds }); cursor = lo;
  }
  return chunks;
}
export function onEvent(state: TrackerState, event: Event, nowMs: number): { state: TrackerState; chunks: Chunk[] } {
  const next = { ...state }; let changed = event.type === 'flush';
  if (event.type === 'activeUrl') { const domain = siteKey(event.url); changed = domain !== next.domain; next.domain = domain; }
  if (event.type === 'windowFocus') { changed = event.focused !== next.focused; next.focused = event.focused; }
  if (event.type === 'idle') { changed = event.idle !== next.idle; next.idle = event.idle; }
  if (!changed) return { state: next, chunks: [] };
  const chunks = state.segment ? splitByDay(state.segment.domain, state.segment.startMs, Math.min(Math.max(nowMs, state.segment.startMs), state.segment.startMs + 120000)) : [];
  next.segment = next.focused && next.idle === 'active' && next.domain ? { domain: next.domain, startMs: nowMs } : null;
  return { state: next, chunks };
}
