import { describe, it, expect } from 'vitest';
import { extractMedia } from '../src/modules/instagram/extract';
import { filename, validUrl } from '../src/modules/instagram/shared';
const version = (name: string, width: number, height: number) => ({ url: `https://scontent.cdninstagram.com/${name}.mp4`, width, height });
describe('Instagram media', () => {
  it('extracts the best variant of a single post', () => {
    expect(extractMedia({ data: { item: { code: 'ABC', pk: '123', user: { username: 'ada' }, video_versions: [version('small', 100, 100), version('large', 1080, 1920)] } } })).toEqual([{ code: 'ABC', pk: '123', username: 'ada', url: version('large', 0, 0).url, index: undefined, count: 1 }]);
  });
  it('extracts a reel using shortcode and owner', () => {
    expect(extractMedia({ shortcode: 'REEL', id: '42', owner: { username: 'mel' }, video_versions: [version('reel', 720, 1280)] })[0]).toMatchObject({ code: 'REEL', pk: '42', username: 'mel', count: 1 });
  });
  it('preserves carousel positions while counting videos', () => {
    const items = extractMedia({ code: 'CAR', pk: '1', user: { username: 'ada' }, carousel_media: [{ pk: '2', image_versions2: {} }, { pk: '3', video_versions: [version('a', 2, 2)] }, { pk: '4', video_versions: [version('b', 3, 3)] }] });
    expect(items.map(x => [x.code, x.pk, x.index, x.count])).toEqual([['CAR', '3', 2, 2], ['CAR', '4', 3, 2]]);
  });
});
describe('Instagram download safety', () => {
  it('only permits HTTPS CDN subdomains', () => {
    expect(validUrl('https://scontent.cdninstagram.com/a')).toBe(true); expect(validUrl('https://video.fbcdn.net/a')).toBe(true);
    for (const url of ['http://video.fbcdn.net/a', 'https://fbcdn.net/a', 'https://evilfbcdn.net/a', 'https://user@video.fbcdn.net/a']) expect(validUrl(url)).toBe(false);
  });
  it('sanitizes filenames and preserves carousel position', () => expect(filename('../ada', 'AB/C', 2)).toBe('instagram-ada-ABC-2.mp4'));
});
