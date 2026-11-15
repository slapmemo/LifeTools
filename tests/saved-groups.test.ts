import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sortSavedGroups, sortSavedTabs, clusterBySite, orderClusters, siteLabel, filterSavedGroup, groupTargetLabels, HIDDEN_PREFIX, hiddenOpenTabs, matchesQuery, newGroupTitle, partitionSaveable, savedCardModel, savedStoredName } from '../src/modules/tab-manager/logic';
import { AUTO_PREFIX, createSessionsRepo, type Session, type SessionTab } from '../src/modules/life-browser/repo';
import { runMigrations } from '../src/db/migrations';
import { createMemoryExecutor } from './sqlite-memory';
import { appendToSavedGroup } from '../src/modules/tab-manager/saved-group-append';

const tab = (id: number, extra: Partial<SessionTab> = {}): SessionTab => ({ id, session_id: 1, position: id, url: `https://site${id}.com/yol`, title: `Başlık ${id}`, pinned: 0, group_title: 'Okuma', group_color: 'green', note: null, ...extra });
const session = (name: string, id = 1): Session => ({ id, name, created_at: 5, tab_count: 1 });
const input = (url: string, group_title: string | null = 'Sonra') => ({ url, title: null, pinned: false, group_title, group_color: 'blue' });

describe('kayıtlı grup kart modeli', () => {
  it('gizli grubu öneksiz ad ve renkle, oturumu otomatik etiketiyle modeller', () => {
    expect(savedCardModel(session(HIDDEN_PREFIX + 'Okuma'), [tab(1), tab(2)])).toEqual({ id: 1, kind: 'hidden', name: 'Okuma', color: 'green', count: 2, auto: false, createdAt: 5 });
    expect(savedCardModel(session(AUTO_PREFIX + '12:00'), [tab(1)])).toMatchObject({ kind: 'session', name: AUTO_PREFIX + '12:00', color: null, count: 1, auto: true });
    expect(savedCardModel(session('İş'), [tab(1)])).toMatchObject({ kind: 'session', name: 'İş', auto: false });
  });
  it('yeniden adlandırmada gizli önek korunur, grup başlığı görünen adla eşitlenir', () => {
    expect(savedStoredName('hidden', '  Yeni  ')).toBe(HIDDEN_PREFIX + 'Yeni');
    expect(savedStoredName('session', '  Yeni  ')).toBe('Yeni');
    expect(hiddenOpenTabs([tab(1, { group_title: 'Eski' })], 'Yeni')[0].group_title).toBe('Yeni');
    expect(hiddenOpenTabs([tab(1, { group_title: '' })], 'Adsız grup')[0].group_title).toBe('');
  });
});

describe('arama eşleşmesi', () => {
  it('Türkçe küçük harfle eşleşir; boş arama her şeyi gösterir', () => {
    expect(matchesQuery('İSTANBUL Haberleri', 'istanbul')).toBe(true);
    expect(matchesQuery('Bir şey', '   ')).toBe(true);
    expect(matchesQuery('Bir şey', 'yok')).toBe(false);
  });
  it('kayıtlı grubu ada, başlığa veya adrese göre süzer ve eşleşince açar', () => {
    const tabs = [tab(1), tab(2, { title: 'Çiçekler' })];
    expect(filterSavedGroup('Okuma', tabs, '')).toEqual({ visible: true, expand: false, tabs });
    expect(filterSavedGroup('Okuma', tabs, 'oku')).toEqual({ visible: true, expand: true, tabs });
    expect(filterSavedGroup('Okuma', tabs, 'çiçek').tabs.map(t => t.id)).toEqual([2]);
    expect(filterSavedGroup('Okuma', tabs, 'site1.com')).toMatchObject({ visible: true, expand: true });
    expect(filterSavedGroup('Okuma', tabs, 'bulunmaz')).toMatchObject({ visible: false, expand: false, tabs: [] });
  });
});

describe('gruba ekle etiketleri ve yardımcılar', () => {
  it('yalnızca aynı ad farklı pencerelerde tekrarlanınca pencere numarası ekler', () => {
    const windows = new Map([[10, 1], [20, 2]]);
    const labels = groupTargetLabels([{ id: 1, windowId: 10, title: 'Sonra' }, { id: 2, windowId: 20, title: 'Sonra ' }, { id: 3, windowId: 10, title: 'İş' }, { id: 4, windowId: 20 }], id => windows.get(id));
    expect(labels.map(l => l.label)).toEqual(['Sonra · Pencere 1', 'Sonra · Pencere 2', 'İş', 'Adsız grup']);
  });
  it('boş yeni grup adına varsayılan verir', () => {
    expect(newGroupTitle('   ')).toBe('Yeni grup');
    expect(newGroupTitle(' Proje ')).toBe('Proje');
  });
  it('kaydedilemeyen sekmeleri ayırır', () => {
    const result = partitionSaveable([{ id: 1, url: 'https://a.com' }, { id: 2, url: 'chrome://settings' }, { id: 3 }, { url: 'https://b.com' }, { id: 5, pendingUrl: 'https://c.com' }], url => url.startsWith('chrome://'));
    expect(result.saveable.map(t => [t.id, t.savedUrl])).toEqual([[1, 'https://a.com'], [5, 'https://c.com']]);
    expect(result.skipped).toHaveLength(3);
  });
});

describe('oturum deposu: ekleme, bulma, boşalınca silme', () => {
  it('keeps a hidden group hidden when an ungrouped tab is appended', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const id = await repo.save(HIDDEN_PREFIX + 'Okuma', [{ ...input('https://a.com', 'Okuma'), group_color: 'green' }]);
    await appendToSavedGroup(repo, id, [{ ...input('https://b.com', null), group_color: null, note: 'discarded' }]);
    const rows = await repo.tabs(id);
    const saved = (await repo.list()).find(item => item.id === id)!;
    expect(rows[1]).toMatchObject({ group_title: 'Okuma', group_color: 'green', note: null });
    expect(savedCardModel(saved, rows)).toMatchObject({ kind: 'hidden', name: 'Okuma', color: 'green', count: 2 });
  });
  it('kayıtlı gruba sıradaki konumlardan sekme ekler ve kimlikleri döndürür', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const id = await repo.save(HIDDEN_PREFIX + 'Sonra', [input('https://a.com'), input('https://b.com')]);
    const other = await repo.save('Diğer', [input('https://x.com', null)]);
    const added = await repo.appendTabs(id, [input('https://c.com'), input('https://d.com')]);
    const rows = await repo.tabs(id);
    expect(rows.map(r => [r.position, r.url])).toEqual([[0, 'https://a.com'], [1, 'https://b.com'], [2, 'https://c.com'], [3, 'https://d.com']]);
    expect(rows.slice(2).map(r => r.id)).toEqual(added);
    expect(await repo.tabs(other)).toHaveLength(1);
    await expect(repo.appendTabs(9999, [input('https://e.com')])).rejects.toThrow('Kayıtlı grup bulunamadı.');
    await expect(repo.appendTabs(id, [])).rejects.toThrow('Kaydedilecek sekme yok.');
    expect(await repo.tabs(id)).toHaveLength(4);
  });
  it('gizli grubu kırpılmış birebir adla, en yenisi önce bulur', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    let now = 1;
    const repo = createSessionsRepo(ex, () => now);
    const older = await repo.save(HIDDEN_PREFIX + 'Sonra', [input('https://a.com')]);
    now = 2;
    const newer = await repo.save(HIDDEN_PREFIX + 'Sonra', [input('https://b.com')]);
    await repo.save('Sonra', [input('https://c.com')]);
    await repo.save(HIDDEN_PREFIX + 'Sonraki', [input('https://d.com')]);
    expect((await repo.findHiddenByName('  Sonra ')).map(s => s.id)).toEqual([newer, older]);
    expect(await repo.findHiddenByName('sonra')).toEqual([]);
    expect(await repo.findHiddenByName('  ')).toEqual([]);
  });
  it('removeTab ve removeTabs boşalan oturumu siler', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const single = await repo.save('Tek', [input('https://a.com', null)]);
    const pair = await repo.save('Çift', [input('https://a.com', null), input('https://b.com', null)]);
    await repo.removeTab(single, (await repo.tabs(single))[0].id);
    expect((await repo.list()).map(s => s.id)).toEqual([pair]);
    const [first, second] = await repo.tabs(pair);
    await repo.removeTabs(pair, [first.id]);
    expect(await repo.tabs(pair)).toHaveLength(1);
    await repo.removeTabs(pair, [second.id]);
    expect(await repo.list()).toEqual([]);
  });
  it('kaydetme tek işlemdir: sekme yazımı başarısız olursa oturum da kalmaz', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    await expect(repo.save('Bozuk', [input('https://a.com'), { ...input('https://b.com'), url: null as unknown as string }])).rejects.toThrow();
    expect(await repo.list()).toEqual([]);
    expect(await ex.query('SELECT id FROM session_tabs')).toEqual([]);
  });
});

describe('moveTab', () => {
  it('moves atomically to the end with target metadata and removes an empty source', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const source = await repo.save('Source', [input('https://source.com', 'Source')]);
    const target = await repo.save('Target', [input('https://target.com', 'Target')]);
    const row = (await repo.tabs(source))[0];
    await repo.moveTab(source, row.id, target);
    const rows = await repo.tabs(target);
    expect(rows.map(r => [r.id, r.position, r.group_title, r.group_color])).toEqual([[rows[0].id, 0, 'Target', 'blue'], [rows[1].id, 1, 'Target', 'blue']]);
    expect(rows[1].id).toBeGreaterThan(row.id);
    expect((await repo.list()).map(s => s.id)).toEqual([target]);
  });
  it('preserves the source if the target does not exist, and ignores the same session', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const source = await repo.save('Source', [input('https://source.com')]);
    const row = (await repo.tabs(source))[0];
    await repo.moveTab(source, row.id, 9999);
    await repo.moveTab(source, row.id, source);
    expect(await repo.tabs(source)).toEqual([row]);
  });
});


describe('kayıtlı sıralama', () => {
  it('grupları tarih veya elle sıralar, yeni grupları öne alır', () => {
    const groups = [{ ...session('a', 1), created_at: 1 }, { ...session('b', 2), created_at: 2 }, { ...session('c', 3), created_at: 3 }];
    expect(sortSavedGroups(groups, 'date', [1, 2]).map(g => g.id)).toEqual([3, 2, 1]);
    expect(sortSavedGroups(groups, 'site', [1, 2]).map(g => g.id)).toEqual([3, 1, 2]);
  });
  it('sekmeleri kimlik veya konuma göre sıralar ve siteleri kümeler', () => {
    const rows = [tab(3, { position: 0, url: 'chrome://settings' }), tab(1, { position: 2, url: 'https://youtu.be/a' }), tab(2, { position: 1, url: 'https://www.youtube.com/b' })];
    expect(sortSavedTabs(rows, 'manual').map(t => t.id)).toEqual([3, 2, 1]);
    expect(sortSavedTabs(rows, 'date').map(t => t.id)).toEqual([1, 2, 3]);
    expect(clusterBySite(rows).map(c => [c.label, c.tabs.map(t => t.id)])).toEqual([['YouTube', [1, 2]], ['Diğer', [3]]]);
    expect(siteLabel('google.com.tr')).toBe('Google'); expect(siteLabel('twitter.com')).toBe('X');
  });
  it('konumları tek batch ile yeniden yazar ve başka grubu etkilemez', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex); const repo = createSessionsRepo(ex);
    const id = await repo.save('Bir', [input('https://a.com'), input('https://b.com')]);
    const other = await repo.save('?ki', [input('https://c.com')]); const rows = await repo.tabs(id);
    const batch = ex.batch.bind(ex); let calls = 0; ex.batch = async statements => { calls++; return batch(statements); };
    await repo.reorderTabs(id, [rows[1].id, rows[0].id]);
    expect(calls).toBe(1); expect((await repo.tabs(id)).map(t => t.id)).toEqual([rows[1].id, rows[0].id]);
    expect((await repo.tabs(other))[0].position).toBe(0);
  });
});


describe('site sırası ve sayfa kimlikleri', () => {
  it('bilinen siteleri saklanan sırada, yeni siteleri sayıya göre ve Diğer son sırada gösterir', () => {
    const clusters = clusterBySite([tab(1, { url: 'https://a.com' }), tab(2, { url: 'https://b.com' }), tab(3, { url: 'https://b.com/2' }), tab(4, { url: 'chrome://settings' })]);
    expect(orderClusters(clusters, []).map(c => c.key)).toEqual(['b.com', 'a.com', '']);
    expect(orderClusters(clusters, ['', 'a.com', 'missing']).map(c => c.key)).toEqual(['', 'a.com', 'b.com']);
  });
  it('kodda kullanılan tüm sabit kimlikler HTML içinde bulunur', () => {
    const code = readFileSync('src/modules/tab-manager/tabs.ts', 'utf8');
    const html = readFileSync('src/modules/tab-manager/tabs.html', 'utf8');
    const ids = [...code.matchAll(/(?:el(?:<[^>]+>)?|document\.querySelector)\(\s*['"]#([\w-]+)['"]/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(html, `Missing HTML id: ${id}`).toMatch(new RegExp(`\\bid=["']${id}["']`));
  });
});
