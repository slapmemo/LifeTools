import { describe, expect, it } from 'vitest';
import { detectPageKind, nextStatus, normalizePageUrl } from '../src/modules/watchlist/page-logic';

describe('watchlist page helpers', () => {
  it('normalizes supported page URLs and rejects other pages', () => {
    expect(normalizePageUrl('https://www.youtube.com/watch?t=2&v=abc_123-x')).toEqual({ site: 'youtube', id: 'abc_123-x', url: 'https://www.youtube.com/watch?v=abc_123-x' });
    expect(normalizePageUrl('https://www.imdb.com/title/tt12345/?ref_=x')?.url).toBe('https://www.imdb.com/title/tt12345/');
    expect(normalizePageUrl('https://www.youtube.com/results?v=abc')).toBeNull();
    expect(normalizePageUrl('https://evil.com/title/tt123/')).toBeNull();
  });
  it('detects kinds and cycles through statuses', () => {
    expect(detectPageKind('youtube', 'TV Series')).toBe('video');
    expect(detectPageKind('imdb', 'TV Series')).toBe('dizi');
    expect(detectPageKind('imdb', 'Dizi')).toBe('dizi');
    expect(detectPageKind('imdb', 'Movie')).toBe('film');
    expect(nextStatus('izlenecek')).toBe('izleniyor');
    expect(nextStatus('izleniyor')).toBe('bitti');
    expect(nextStatus('bitti')).toBe('izlenecek');
  });
});
