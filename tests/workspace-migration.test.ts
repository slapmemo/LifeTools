import { describe, expect, it } from 'vitest';
import { migrationSessions } from '../src/modules/tab-manager/workspace-migration';

describe('stored session migration', () => {
  it('preserves eligible tabs and names sessions without reserved prefixes', () => {
    expect(migrationSessions([
      { name: 'İş', tabs: [{ url: 'https://example.com/', title: 'Örnek' }, { url: 'file:///C:/a.txt' }, { url: 'chrome://newtab/' }] },
      { name: 'Boş', tabs: [{ url: 'chrome://newtab/' }] },
      { name: 'Kişisel', tabs: [{ url: 'http://example.org', title: 'Başlık' }] }
    ])).toEqual([
      { name: 'Çalışma alanı: İş', tabs: [
        { url: 'https://example.com/', title: 'Örnek', pinned: false, group_title: null, group_color: null },
        { url: 'file:///C:/a.txt', title: null, pinned: false, group_title: null, group_color: null }
      ] },
      { name: 'Çalışma alanı: Kişisel', tabs: [{ url: 'http://example.org', title: 'Başlık', pinned: false, group_title: null, group_color: null }] }
    ]);
  });
  it('tolerates malformed input and keeps valid tabs', () => {
    expect(migrationSessions(null)).toEqual([]);
    expect(migrationSessions([null, {}, { tabs: [null, {}, { url: 5 }, { url: 'https://%' }, { url: 'https://example.com', title: 8 }] }])).toEqual([
      { name: 'Çalışma alanı: Adsız', tabs: [{ url: 'https://example.com', title: null, pinned: false, group_title: null, group_color: null }] }
    ]);
    expect(migrationSessions([{ name: 'a'.repeat(150), tabs: [{ url: 'https://example.com' }] }])[0].name).toHaveLength(100);
  });
});
