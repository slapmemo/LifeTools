import { expect, test } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';
import { AUTO_PREFIX, createSessionsRepo, oldAutoSessionIds } from '../src/modules/life-browser/repo';
import { decideAutoGroup, findDuplicates, normalizeUrl, planGroupsBySite, toSessionTabs, type TabLike } from '../src/modules/life-browser/tabs';

const tab = (id: number, url: string, extra: Partial<TabLike> = {}): TabLike => ({ id, url, pinned: false, groupId: -1, index: id, ...extra });

test('otomatik gruplama mevcut gruba katılır veya uygun sekmeyle grup oluşturur', () => {
  const a = tab(1, 'https://www.example.com/a'), b = tab(2, 'https://example.com/b');
  const groups = new Map([[7, { title: 'example.com', color: 'red' }]]);
  expect(decideAutoGroup(b, [a, b], groups, new Set())).toEqual({ action: 'join', groupId: 7 });
  const plan = decideAutoGroup(b, [a, b], new Map(), new Set());
  expect(plan).toMatchObject({ action: 'create', tabIds: [1, 2], title: 'example.com' });
  expect(decideAutoGroup(b, [a, b], new Map(), new Set())).toEqual(plan);
  expect(decideAutoGroup(b, [a, b], new Map(), new Set([1]))).toEqual({ action: 'none' });
  expect(decideAutoGroup(b, [a, b], groups, new Set([2]))).toEqual({ action: 'none' });
  expect(decideAutoGroup({ ...b, pinned: true }, [a, b], groups, new Set())).toEqual({ action: 'none' });
  expect(decideAutoGroup(tab(3, 'chrome://newtab'), [a, b], groups, new Set())).toEqual({ action: 'none' });
});

test('yalnızca en yeni beş otomatik oturum tutulur', () => {
  const sessions = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: AUTO_PREFIX + i, created_at: i, tab_count: 2 }));
  sessions.push({ id: 8, name: 'El ile', created_at: 0, tab_count: 2 });
  expect(oldAutoSessionIds(sessions)).toEqual([2, 1]);
});

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

test('oturum adı değiştirilir ve yalnızca belirtilen oturumun sekmesi kaldırılır', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex);
  const repo = createSessionsRepo(ex);
  const input = { url: 'https://a.com', title: null, pinned: false, group_title: null, group_color: null };
  const first = await repo.save('İlk', [input, input]);
  const second = await repo.save('İkinci', [input]);
  const [tab] = await repo.tabs(first);
  await repo.rename(first, '  Yeni ad  ');
  await expect(repo.rename(first, ' ')).rejects.toThrow();
  await repo.removeTab(second, tab.id);
  expect(await repo.tabs(first)).toHaveLength(2);
  await repo.removeTab(first, tab.id);
  expect(await repo.tabs(first)).toHaveLength(1);
  expect((await repo.list()).find(s => s.id === first)).toMatchObject({ name: 'Yeni ad', tab_count: 1 });
  expect(await repo.tabs(second)).toHaveLength(1);
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
