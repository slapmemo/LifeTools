import type { Variant } from './extract';
export const X_VIDEO_ID = 'x-video';
export const SETTINGS_KEY = 'xVideoSettings';
export const CHANNEL = 'lifetools:x-video:7d926d';
export type Quality = 'highest' | '720' | 'lowest';
export interface Settings { askQuality: boolean; downloadFolder: string }
export const defaults: Settings = { askQuality: false, downloadFolder: '' };
export function resolution(url: string): number { const m = url.match(/\/(\d+)x(\d+)\//); return m ? Math.min(Number(m[1]), Number(m[2])) : 0; }
export function label(v: Variant): string { const r = resolution(v.url); return r ? `${r}p` : v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : 'MP4'; }
export function sortVariants(v: Variant[]): Variant[] { return [...v].sort ( (a,b) => (resolution(b.url)-resolution(a.url)) || ((b.bitrate ?? 0)-(a.bitrate ?? 0)) ); }
export function selectVariant(v: Variant[], quality: Quality): Variant | undefined { const sorted = sortVariants(v); return quality === 'lowest' ? sorted.at(-1) : quality === '720' ? sorted.find(x => resolution(x.url) <= 720 && resolution(x.url) > 0) ?? sorted[0] : sorted[0]; }
export function validUrl(value: string): boolean { try { const u = new URL(value); return u.protocol === 'https:' && (u.hostname === 'twimg.com' || u.hostname.endsWith('.twimg.com')) && !u.username && !u.password; } catch { return false; } }
export function filename(screenName: string, tweetId: string, res: string, mediaIndex?: number): string { const clean = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x'; return `x-${clean(screenName)}-${clean(tweetId)}-${clean(res)}${mediaIndex === undefined ? '' : `-${mediaIndex + 1}`}.mp4`; }
