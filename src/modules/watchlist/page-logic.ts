import type { Kind, Status } from './repo';

export const PAGE_BUTTON_KEY = 'watchlistPageButtonEnabled';
export const PAGE_ORIGINS = ['https://www.youtube.com/*', 'https://www.imdb.com/*'];
export function normalizePageUrl(raw: string): { site: 'youtube' | 'imdb'; id: string; url: string } | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'www.youtube.com' && u.pathname === '/watch') {
      const id = u.searchParams.get('v');
      if (id && /^[\w-]+$/.test(id)) return { site: 'youtube', id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (u.hostname === 'www.imdb.com') {
      const id = u.pathname.match(/^\/title\/(tt\d+)(?:\/|$)/)?.[1];
      if (id) return { site: 'imdb', id, url: `https://www.imdb.com/title/${id}/` };
    }
  } catch { /* Invalid URL. */ }
  return null;
}
export function detectPageKind(site: 'youtube' | 'imdb', text: string): Kind {
  return site === 'youtube' ? 'video' : /\b(?:tv\s+(?:mini\s+)?series|series|dizi)\b/i.test(text) ? 'dizi' : 'film';
}
export function nextStatus(status: Status): Status {
  return status === 'izlenecek' ? 'izleniyor' : status === 'izleniyor' ? 'bitti' : 'izlenecek';
}
export const STATUS_TEXT: Record<Status, string> = { izlenecek: 'İzlenecek', izleniyor: 'İzleniyor', bitti: 'Bitti ✓' };
