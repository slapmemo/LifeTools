import { expect, test } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';
import { createSessionsRepo } from '../src/modules/life-browser/repo';
import { findDuplicates, normalizeUrl, planGroupsBySite, toSessionTabs, type TabLike } from '../src/modules/life-browser/tabs';

const tab = (id: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({ id, url, pinned: false, groupId: -1, index: id, ...extra });

test('oturum deposu: kaydet, listele, sekmeleri getir, sil (cascade)', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  let now = 1000;
  const repo = createSessionsRepo(ex, () => now);
  const id = await repo.save('  İş  ', [
    { url: 'https://a.com', title: 'A', pinned: true, group_title: null, group_color: null },
    { url: 'https://b.com', title: null, pinned: false, group_title: 'Okuma', group_color: 'blue' }
  ]);
  now = 2000;
  const second = await repo.save('Ev', [{ url: 'https://c.com', title: 'C', pinned: false, group_title: null, group_color: null }]);
  expect(await repo.list()).toEqual([
    { id: second, name: 'Ev', created_at: 2000, tab_count: 1 },
    { id, name: 'İş', created_at: 1000, tab_count: 2 }
  ]);
  const tabs = await repo.tabs(id);
  expect(tabs.map(t => [t.position, t.url, t.pinned, t.group_title, t.group_color])).toEqual([[0, 'https://a.com', 1, null, null], [1, 'https://b.com', 0, 'Okuma', 'blue']]);
  await repo.delete(id);
  expect(await repo.tabs(id)).toEqual([]);
  expect(await ex.query('SELECT session_id FROM session_tabs')).toEqual([{ session_id: second }]);
  expect((await repo.list()).map(s => s.id)).toEqual([second]);
});

test('oturum deposu geçersiz girdileri reddeder', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  const repo = createSessionsRepo(ex);
  await expect(repo.save('   ', [{ url: 'https://a.com', title: null, pinned: false, group_title: null, group_color: null }])).rejects.toThrow();
  await expect(repo.save('Boş', [])).rejects.toThrow('Kaydedilecek sekme yok.');
  expect(await repo.list()).toEqual([]);
});

test('gruplama planı: en az 2 sekme, www birleşir, sabit ve gruplu sekmeler hariç', () => {
  const plan = planGroupsBySite([
    tab(1, 'https://www.example.com/a'),
    tab(2, 'https://example.com/b'),
    tab(3, 'https://solo.com/'),
    tab(4, 'https://news.site/x', { pinned: true }),
    tab(5, 'https://news.site/y'),
    tab(6, 'https://grouped.com/1', { groupId: 9 }),
    tab(7, 'https://grouped.com/2'),
    tab(8, 'chrome://newtab'),
    tab(9, 'chrome://settings'),
    tab(10, 'http://EXAMPLE.com/c')
  ]);
  expect(plan).toEqual([{ site: 'example.com', tabIds: [1, 2, 10] }]);
});

test('kopya bulucu hash farkını yok sayar ve ilkini tutar', () => {
  expect(normalizeUrl('https://a.com/p?q=1#bolum')).toBe('https://a.com/p?q=1');
  const sets = findDuplicates([
    tab(1, 'https://a.com/p#x'),
    tab(2, 'https://b.com/'),
    tab(3, 'https://a.com/p'),
    tab(4, 'https://a.com/p#y'),
    tab(5, 'https://a.com/p?q=2'),
    tab(6, 'https://b.com/', { pinned: true })
  ]);
  expect(sets).toEqual([{ url: 'https://a.com/p', keep: 1, close: [3, 4] }]);
});

test('pencere sekmeleri grup bilgisiyle oturum kaydına çevrilir', () => {
  const groups = new Map([[5, { title: 'Proje', color: 'red' }]]);
  expect(toSessionTabs([tab(2, 'https://b.com', { groupId: 5, index: 1, title: 'B' }), tab(1, 'https://a.com', { pinned: true, index: 0 }), { id: 3, pinned: false, index: 2 }], groups)).toEqual([
    { url: 'https://a.com', title: null, pinned: true, group_title: null, group_color: null },
    { url: 'https://b.com', title: 'B', pinned: false, group_title: 'Proje', group_color: 'red' }
  ]);
});
