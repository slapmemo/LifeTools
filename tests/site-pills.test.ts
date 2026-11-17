import { describe, expect, it } from 'vitest';
import { matchesSitePill, PILL_ALL, PILL_OTHER, siteClusterKey, sitePills } from '../src/modules/tab-manager/logic';

const urls = [
  'https://www.youtube.com/watch?v=a', 'https://m.youtube.com/watch?v=b', 'https://youtu.be/c',
  'https://x.com/a/status/1', 'https://twitter.com/b',
  'https://tr.wikipedia.org/wiki/T%C3%BCrev', 'https://github.com/a', 'chrome://settings'
];

describe('Sekme Yöneticisi site hapları', () => {
  it('YouTube / X alt alan adlarıyla tek site sayılır', () => {
    expect(siteClusterKey('https://m.youtube.com/x')).toBe('youtube.com');
    expect(siteClusterKey('https://twitter.com/x')).toBe('x.com');
    expect(siteClusterKey('https://www.github.com/a')).toBe('github.com');
    expect(siteClusterKey('chrome://settings')).toBe('');
  });

  it('Tümü, kalabalık siteler ve Diğer; sayılar toplamı tutar', () => {
    expect(sitePills(urls)).toEqual([
      { key: PILL_ALL, label: 'Tümü', count: 8 },
      { key: 'youtube.com', label: 'YouTube', count: 3 },
      { key: 'x.com', label: 'X', count: 2 },
      { key: PILL_OTHER, label: 'Diğer', count: 3 }
    ]);
  });

  it('tek sekmeli siteler ayrı hap olmaz; hiç kalabalık site yoksa haplar gizlenir', () => {
    expect(sitePills(['https://a.com', 'https://b.com'])).toEqual([]);
    expect(sitePills([])).toEqual([]);
  });

  it('en fazla `max` site; Diğer olmayınca eklenmez', () => {
    const many = ['a', 'a', 'b', 'b', 'c', 'c'].map(h => `https://${h}.com/`);
    expect(sitePills(many, 2).map(p => p.label)).toEqual(['Tümü', 'a.com', 'b.com', 'Diğer']);
    expect(sitePills(many).map(p => p.label)).toEqual(['Tümü', 'a.com', 'b.com', 'c.com']);
  });

  it('süzme: site, Diğer ve Tümü', () => {
    const pills = sitePills(urls);
    expect(urls.filter(u => matchesSitePill(u, 'youtube.com', pills))).toHaveLength(3);
    expect(urls.filter(u => matchesSitePill(u, PILL_OTHER, pills))).toEqual(['https://tr.wikipedia.org/wiki/T%C3%BCrev', 'https://github.com/a', 'chrome://settings']);
    expect(urls.filter(u => matchesSitePill(u, PILL_ALL, pills))).toHaveLength(8);
  });
});
