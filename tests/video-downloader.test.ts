import { describe, expect, it } from 'vitest';
import { acceptsUrl, cacheFresh, formatJob, formatChip, formatQualityLabel, formatSize, FORMATS_CACHE_TTL, menuPosition, MODE_LABELS, youtubePage, youtubePlaylistId, youtubeVideoId, type VideoJob } from '../src/modules/video-downloader/logic';
describe('video indirici', () => {
  it('oynatma listelerini ve ilerlemeyi gösterir', () => {
    expect(youtubePage('https://www.youtube.com/playlist?list=abc')).toBe('playlist');
    expect(youtubePage('https://www.youtube.com/playlist')).toBe('other');
    expect(youtubePlaylistId('https://www.youtube.com/watch?v=xyz&list=abc')).toBe('abc');
    expect(youtubePlaylistId('https://example.com/playlist?list=abc')).toBeNull();
    expect(youtubeVideoId('https://www.youtube.com/playlist?list=abc')).toBeNull();
    expect(MODE_LABELS['playlist:video_best']).toBe('Tüm liste · en iyi kalite');
    expect(MODE_LABELS['playlist:video_720']).toBe('Tüm liste · 720p');
    expect(MODE_LABELS['playlist:audio_mp3']).toBe('Tüm liste · MP3');
    expect(formatChip({ state: 'running', item: '3/24', percent: '45%' } as VideoJob)).toBe('3/24 · %45');
    expect(formatJob({ state: 'running', item: '3/24', percent: '45%' } as VideoJob)).toBe('İndiriliyor — 3/24 — 45%');
  });
  it('yalnızca web adreslerini kabul eder', () => { expect(acceptsUrl('https://example.com/a')).toBe(true); expect(acceptsUrl('http://example.com')).toBe(true); expect(acceptsUrl('file:///a')).toBe(false); expect(acceptsUrl('invalid')).toBe(false); });
  it('YouTube sayfalarını ayırır', () => { expect(youtubePage('https://www.youtube.com/watch?v=abc')).toBe('watch'); expect(youtubePage('https://www.youtube.com/shorts/abc')).toBe('shorts'); expect(youtubePage('https://www.youtube.com/')).toBe('other'); expect(youtubePage('https://example.com/watch?v=abc')).toBe('other'); });
  it('mod ve iş durumlarını gösterir', () => { expect(MODE_LABELS.audio_mp3).toBe('Sadece ses (MP3)'); expect(formatJob({ state: 'running', percent: '12%' } as VideoJob)).toBe('İndiriliyor — 12%'); expect(formatJob({ state: 'error', error: 'başarısız' } as VideoJob)).toBe('Hata — başarısız'); });
  it('ilerleme ve sonuç metnini biçimler', () => { expect(formatChip({ state: 'running', percent: '42%', speed: '3.1MiB/s', eta: '0:12' } as VideoJob)).toBe('%42 · 3.1MiB/s · 0:12'); expect(formatChip({ state: 'running' } as VideoJob)).toBe('İndiriliyor'); expect(formatChip({ state: 'done' } as VideoJob)).toBe('Bitti ✓'); expect(formatChip({ state: 'error' } as VideoJob)).toBe('Hata'); });
  it('menüyü görünür alanda tutar ve gerektiğinde yukarı açar', () => { expect(menuPosition({ left: -20, top: 20, bottom: 50 }, { width: 180, height: 100 }, { width: 300, height: 300 })).toEqual({ left: 8, top: 54 }); expect(menuPosition({ left: 280, top: 260, bottom: 290 }, { width: 180, height: 100 }, { width: 300, height: 300 })).toEqual({ left: 112, top: 156 }); });
  it('boyutları ve kalite satırlarını biçimler', () => { expect(formatSize(180 * 1024 ** 2, true)).toBe('~180 MB'); expect(formatSize(1.2 * 1024 ** 3, false)).toBe('1,2 GB'); expect(formatSize(null, true)).toBe('boyut bilinmiyor'); expect(formatQualityLabel('1080p60', { sizeBytes: 180 * 1024 ** 2, approx: true })).toBe('1080p60 · ~180 MB'); expect(formatQualityLabel('Sadece ses (MP3)', { sizeBytes: null, approx: false })).toBe('Sadece ses (MP3) · boyut bilinmiyor'); });
  it('önbelleği on dakika boyunca video kimliğine göre kullanır', () => { expect(youtubeVideoId('https://www.youtube.com/watch?v=abc&t=3')).toBe('abc'); expect(youtubeVideoId('https://www.youtube.com/shorts/abc')).toBe('abc'); expect(cacheFresh(1000, 1000 + FORMATS_CACHE_TTL - 1)).toBe(true); expect(cacheFresh(1000, 1000 + FORMATS_CACHE_TTL)).toBe(false); expect(cacheFresh(1000, 999)).toBe(false); });
});
