export const VIDEO_ID = 'video-downloader';
export const YOUTUBE_ORIGINS = ['https://www.youtube.com/*'];
export const YOUTUBE_BUTTON_KEY = 'videoDownloaderYoutubeButton';
export const MODE_LABELS = { video_best: 'En iyi kalite', video_1080: '1080p', video_720: '720p', audio_mp3: 'Sadece ses (MP3)', 'playlist:video_best': 'Tüm liste · en iyi kalite', 'playlist:video_720': 'Tüm liste · 720p', 'playlist:audio_mp3': 'Tüm liste · MP3' } as const;
export type VideoMode = keyof typeof MODE_LABELS | `height:${number}`;
export interface SizeEstimate { sizeBytes: number | null; approx: boolean }
export interface VideoFormat extends SizeEstimate { height: number; fps: number | null; label: string }
export interface VideoFormats { formats: VideoFormat[]; audio: SizeEstimate; title: string | null; duration: number | null }
export const FORMATS_CACHE_TTL = 10 * 60 * 1000;
export function cacheFresh(timestamp: number, now = Date.now()): boolean { return now >= timestamp && now - timestamp < FORMATS_CACHE_TTL; }
export function youtubeVideoId(raw: string): string | null { const page = youtubePage(raw); if (page !== 'watch' && page !== 'shorts') return null; const u = new URL(raw); return page === 'watch' ? u.searchParams.get('v') : u.pathname.split('/')[2] || null; }
export function youtubePlaylistId(raw: string): string | null { try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'www.youtube.com' && (u.pathname === '/watch' || u.pathname === '/playlist') ? u.searchParams.get('list') || null : null; } catch { return null; } }
export function formatSize(sizeBytes: number | null, approx: boolean): string { if (sizeBytes == null) return 'boyut bilinmiyor'; const prefix = approx ? '~' : ''; return sizeBytes < 1024 ** 3 ? `${prefix}${Math.round(sizeBytes / 1024 ** 2)} MB` : `${prefix}${(sizeBytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`; }
export function formatQualityLabel(label: string, estimate: SizeEstimate): string { return `${label} · ${formatSize(estimate.sizeBytes, estimate.approx)}`; }
export interface VideoJob { id: string; url: string; mode: string; state: string; percent: string | null; speed: string | null; eta: string | null; item?: string | null; file: string | null; error: string | null }
export interface ToolStatus { ytdlp: { installed: boolean; version: string | null }; ffmpeg: boolean; installing: boolean; error: string | null; folder: string }
export function acceptsUrl(raw: string): boolean { try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname; } catch { return false; } }
export function youtubePage(raw: string): 'watch' | 'shorts' | 'playlist' | 'other' { try { const u = new URL(raw); if (u.protocol !== 'https:' || u.hostname !== 'www.youtube.com') return 'other'; if (u.pathname === '/watch' && !!u.searchParams.get('v')) return 'watch'; if (u.pathname === '/playlist' && !!u.searchParams.get('list')) return 'playlist'; if (/^\/shorts\/[^/]+/.test(u.pathname)) return 'shorts'; } catch {} return 'other'; }
export function formatJob(job: VideoJob): string { const label: Record<string, string> = { running: 'İndiriliyor', done: 'İndirildi', error: 'Hata', cancelled: 'İptal edildi' }; return [label[job.state] ?? job.state, job.item, job.percent, job.state === 'error' ? job.error : null].filter(Boolean).join(' — '); }
export function formatChip(job: VideoJob): string {
  if (job.state === 'done') return 'Bitti ✓';
  if (job.state === 'error') return 'Hata';
  if (job.state === 'cancelled') return 'İptal edildi';
  const percent = job.percent?.trim().replace(/%/g, '');
  return [job.item, percent ? `%${percent}` : 'İndiriliyor', job.speed, job.eta].filter(Boolean).join(' · ');
}
export function menuPosition(button: { left: number; bottom: number; top: number }, menu: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number } {
  const margin = 8;
  return { left: Math.max(margin, Math.min(button.left, viewport.width - menu.width - margin)), top: Math.max(margin, Math.min(button.bottom + 4 + menu.height <= viewport.height - margin ? button.bottom + 4 : button.top - menu.height - 4, viewport.height - menu.height - margin)) };
}
