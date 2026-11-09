export const INSTAGRAM_ID = 'instagram';
export const SETTINGS_KEY = 'instagramSettings';
export const CHANNEL = 'lifetools:instagram:8a72';
export interface Settings { downloadButton: boolean; seekBar: boolean; speedControl: boolean }
export const defaults: Settings = { downloadButton: true, seekBar: true, speedControl: true };
export function validUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (u.hostname.endsWith('.cdninstagram.com') || u.hostname.endsWith('.fbcdn.net')); } catch { return false; }
}
export function filename(username: string, code: string, index?: number): string {
  const clean = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'x';
  return `instagram-${clean(username)}-${clean(code)}${index === undefined ? '' : `-${index}`}.mp4`;
}
