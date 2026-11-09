import { describe, expect, it } from 'vitest';
import { acceptsUrl, formatJob, MODE_LABELS, youtubePage, type VideoJob } from '../src/modules/video-downloader/logic';
describe('video indirici', () => {
  it('yalnızca web adreslerini kabul eder', () => { expect(acceptsUrl('https://example.com/a')).toBe(true); expect(acceptsUrl('http://example.com')).toBe(true); expect(acceptsUrl('file:///a')).toBe(false); expect(acceptsUrl('invalid')).toBe(false); });
  it('YouTube sayfalarını ayırır', () => { expect(youtubePage('https://www.youtube.com/watch?v=abc')).toBe('watch'); expect(youtubePage('https://www.youtube.com/shorts/abc')).toBe('shorts'); expect(youtubePage('https://www.youtube.com/')).toBe('other'); expect(youtubePage('https://example.com/watch?v=abc')).toBe('other'); });
  it('mod ve iş durumlarını gösterir', () => { expect(MODE_LABELS.audio_mp3).toBe('Sadece ses (MP3)'); expect(formatJob({ state: 'running', percent: '12%' } as VideoJob)).toBe('İndiriliyor — 12%'); expect(formatJob({ state: 'error', error: 'başarısız' } as VideoJob)).toBe('Hata — başarısız'); });
});
