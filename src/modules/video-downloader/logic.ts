export const VIDEO_ID = 'video-downloader';
export const YOUTUBE_ORIGINS = ['https://www.youtube.com/*'];
export const YOUTUBE_BUTTON_KEY = 'videoDownloaderYoutubeButton';
export const MODE_LABELS = { video_best: 'En iyi kalite', video_1080: '1080p', video_720: '720p', audio_mp3: 'Sadece ses (MP3)' } as const;
export type VideoMode = keyof typeof MODE_LABELS;
export interface VideoJob { id: string; url: string; mode: string; state: string; percent: string | null; speed: string | null; eta: string | null; file: string | null; error: string | null }
export interface ToolStatus { ytdlp: { installed: boolean; version: string | null }; ffmpeg: boolean; installing: boolean; error: string | null; folder: string }
export function acceptsUrl(raw: string): boolean { try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname; } catch { return false; } }
export function youtubePage(raw: string): 'watch' | 'shorts' | 'other' { try { const u = new URL(raw); if (u.protocol !== 'https:' || u.hostname !== 'www.youtube.com') return 'other'; if (u.pathname === '/watch' && !!u.searchParams.get('v')) return 'watch'; if (/^\/shorts\/[^/]+/.test(u.pathname)) return 'shorts'; } catch {} return 'other'; }
export function formatJob(job: VideoJob): string { const label: Record<string, string> = { running: 'İndiriliyor', done: 'İndirildi', error: 'Hata', cancelled: 'İptal edildi' }; return [label[job.state] ?? job.state, job.percent, job.state === 'error' ? job.error : null].filter(Boolean).join(' — '); }
export function formatChip(job: VideoJob): string {
  if (job.state === 'done') return 'Bitti ✓';
  if (job.state === 'error') return 'Hata';
  if (job.state === 'cancelled') return 'İptal edildi';
  const percent = job.percent?.trim().replace(/%/g, '');
  return [percent ? `%${percent}` : 'İndiriliyor', job.speed, job.eta].filter(Boolean).join(' · ');
}
export function menuPosition(button: { left: number; bottom: number; top: number }, menu: { width: number; height: number }, viewport: { width: number; height: number }): { left: number; top: number } {
  const margin = 8;
  return { left: Math.max(margin, Math.min(button.left, viewport.width - menu.width - margin)), top: Math.max(margin, Math.min(button.bottom + 4 + menu.height <= viewport.height - margin ? button.bottom + 4 : button.top - menu.height - 4, viewport.height - menu.height - margin)) };
}
