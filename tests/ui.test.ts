import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildContextMenuTree,
  CONTEXT_MENU_ROOT_ID,
  CONTEXT_MENU_ROOT_TITLE,
  visibleTopItemsForContext,
  type ContextMenuContribution
} from '../src/core/context-menu';
import {
  categories,
  filterToolbarActions,
  groupModulesByCategory,
  metinTabs,
  notlarTabs,
  odakTabs,
  popupVisibility,
  resolveActiveTab,
  routeCategory,
  sekmelerTabs
} from '../src/core/ui-visibility';
import { modules } from '../src/modules';
import { clipSlotsMenuContributions } from '../src/modules/clip-slots/background';
import { linkCleanerMenuContributions } from '../src/modules/link-cleaner/background';
import { quickTasksMenuContributions } from '../src/modules/quick-tasks/background';
import { slapMemoMenuContributions } from '../src/modules/slapmemo/background';
import { smartRepliesMenuContributions } from '../src/modules/smart-replies/background';
import { validateTrigger } from '../src/modules/smart-replies/repo';
import { findTriggerAtCaret } from '../src/modules/smart-replies/trigger';
import { tabLabelsMenuContributions } from '../src/modules/tab-labels/background';
import { mergeTabItems } from '../src/modules/tab-notes/panel';
import { watchlistMenuContributions } from '../src/modules/watchlist/background';
import { extractDomain, formatRelativeDate, groupTasksByDate } from '../src/panel/ui';
import { formatSites, formatTasks } from '../src/popup/summary';

function luminance(hex: string): number {
  const parts = hex.match(/[0-9a-f]{2}/gi)!;
  const rgb = parts.map(p => {
    const v = parseInt(p, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

function ratio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('arayüz', () => {
  it('tema renkleri AA kontrastını karşılar', () => {
    const css = readFileSync('design/tokens.css', 'utf8');
    const blocks = [
      css.match(/:root, :root\[data-theme="light"\]\s*\{([^}]+)}/)![1],
      css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)}/)![1]
    ];
    for (const block of blocks) {
      const token = (name: string) => block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
      for (const [a, b] of [
        ['text', 'bg'],
        ['text', 'surface'],
        ['accent', 'bg'],
        ['on-accent', 'accent']
      ]) {
        expect(ratio(token(a), token(b))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('yönlendirme ve gizli kategoriler', () => {
    const visible = categories({ 'quick-tasks': false });
    expect(visible.some(c => c.id === 'gorevler')).toBe(false);
    expect(routeCategory('#gorevler', visible)).toBe('notlar');
    expect(routeCategory('#odak', visible)).toBe('odak');
    expect(routeCategory('#unknown', visible)).toBe('notlar');
  });

  it('popup görünürlüğü ve özet', () => {
    expect(popupVisibility({ 'quick-tasks': false }).tasks).toBe(false);
    expect(popupVisibility({ 'smart-replies': false }).snippets).toBe(false);
    expect(formatTasks(3, 1)).toBe('3 açık görev (1 gecikmiş)');
    expect(formatSites([{ domain: 'x.com', seconds: 120 }])).toBe('x.com 2 dk');
  });

  it('göreli tarih biçimlendirme ("az önce", "2 saat önce", "dün", tarih)', () => {
    const now = new Date(2026, 10, 6, 15, 0, 0).getTime();
    expect(formatRelativeDate(now - 20_000, now)).toBe('az önce');
    expect(formatRelativeDate(now - 15 * 60_000, now)).toBe('15 dk önce');
    expect(formatRelativeDate(now - 2 * 3_600_000, now)).toBe('2 saat önce');
    expect(formatRelativeDate(new Date(2026, 10, 5, 11, 0, 0).getTime(), now)).toBe('dün');
    const older = formatRelativeDate(new Date(2026, 10, 1, 10, 0, 0).getTime(), now);
    expect(older).toMatch(/1/);
  });

  it('görevleri enjekte edilen "today" tarihine göre gruplar', () => {
    const today = '2026-11-06';
    const tasks = [
      { id: 1, title: 'Gecikmiş görev', due_date: '2026-11-05', done_at: null },
      { id: 2, title: 'Bugünkü görev', due_date: '2026-11-06', done_at: null },
      { id: 3, title: 'Yarınki görev', due_date: '2026-11-07', done_at: null },
      { id: 4, title: 'Tarihsiz görev', due_date: null, done_at: null },
      { id: 5, title: 'Bitmiş görev', due_date: '2026-11-05', done_at: 1000 }
    ];
    const grouped = groupTasksByDate(tasks, today);
    expect(grouped.overdue.map(t => t.id)).toEqual([1]);
    expect(grouped.today.map(t => t.id)).toEqual([2]);
    expect(grouped.upcoming.map(t => t.id)).toEqual([3]);
    expect(grouped.undated.map(t => t.id)).toEqual([4]);
  });

  it('alan adını ve düz toLowerCase tetikleyici küçültmesini doğrular', () => {
    expect(extractDomain('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(extractDomain('javascript:alert(1)')).toBeNull();
    expect(validateTrigger('/LIST')).toBe('/list');
    expect(validateTrigger(';ADRESIM')).toBe(';adresim');
    expect(findTriggerAtCaret('merhaba /LIST', ['/list'])).toBe('/list');
  });

  it('tek kök LifeTools sağ tık menüsünü bağlama ve açık modüllere göre kurar', () => {
    const allContributions: ContextMenuContribution[] = [
      ...watchlistMenuContributions(),
      ...clipSlotsMenuContributions([{ label: 'Adres', text: 'İstanbul' }]),
      ...slapMemoMenuContributions(),
      ...linkCleanerMenuContributions(),
      ...smartRepliesMenuContributions([{ id: 1, trigger: '/iade', title: 'İade' }]),
      ...quickTasksMenuContributions(),
      ...tabLabelsMenuContributions()
    ];

    const tree = buildContextMenuTree(allContributions, {});
    expect(tree[0]).toEqual({
      id: CONTEXT_MENU_ROOT_ID,
      title: CONTEXT_MENU_ROOT_TITLE,
      contexts: ['selection', 'editable', 'link', 'page']
    });

    expect(visibleTopItemsForContext(tree, 'selection').map(i => i.title)).toEqual([
      'Not olarak kaydet',
      'Görev olarak ekle',
      'Yuvaya kaydet'
    ]);
    expect(visibleTopItemsForContext(tree, 'editable').map(i => i.title)).toEqual([
      'Şablon ekle',
      'Yuvadan yapıştır'
    ]);
    expect(visibleTopItemsForContext(tree, 'link').map(i => i.title)).toEqual([
      'Not olarak kaydet',
      'Temiz linki kopyala',
      'İzleme listesine ekle'
    ]);
    expect(visibleTopItemsForContext(tree, 'page').map(i => i.title)).toEqual([
      'Not olarak kaydet',
      'Görev olarak ekle',
      'Bu sayfanın temiz linki',
      'İzleme listesine ekle',
      'Etiket: Önemli',
      'Etiket: Sonra Bak',
      'Etiket: Araştırma',
      'Etiketi kaldır'
    ]);

    // Kapalı modüllerin öğeleri ve alt öğeleri ağaçtan tamamen kalkar
    const filtered = buildContextMenuTree(allContributions, {
      slapmemo: false,
      'clip-slots': false,
      'tab-labels': false
    });
    const ids = new Set(filtered.map(i => i.id));
    expect(ids.has('slapmemo')).toBe(false);
    expect(ids.has('slapmemo:note')).toBe(false);
    expect(ids.has('clip:save')).toBe(false);
    expect(ids.has('clip:save:0')).toBe(false);
    expect(ids.has('clip:paste')).toBe(false);
    expect(ids.has('tab-labels-menu')).toBe(false);
    expect(ids.has('quick-tasks:add')).toBe(true);

    // Tüm modüller kapalıysa kök menü de oluşturulmaz
    const allOff = buildContextMenuTree(allContributions, {
      slapmemo: false,
      'quick-tasks': false,
      'clip-slots': false,
      'smart-replies': false,
      'link-cleaner': false,
      watchlist: false,
      'tab-labels': false
    });
    expect(allOff).toEqual([]);
  });

  it('kapalı araçları alt sekmelerden, site araç çubuğundan gizler ve modülleri gruplar', () => {
    expect(sekmelerTabs({})).toEqual(['oturumlar', 'temizlik', 'etiket-notlar', 'arac-cubugu']);
    expect(
      sekmelerTabs({
        'life-browser': false,
        'zombie-tabs': false,
        'pinned-guard': false
      })
    ).toEqual(['etiket-notlar', 'arac-cubugu']);
    expect(resolveActiveTab('oturumlar', ['etiket-notlar', 'arac-cubugu'] as const, 'oturumlar')).toBe(
      'etiket-notlar'
    );

    expect(odakTabs({ 'site-blocker': false })).toEqual(['sureler']);
    expect(notlarTabs({ slapmemo: false })).toEqual(['watchlist']);
    expect(metinTabs({ 'smart-replies': false, 'clip-slots': false })).toEqual(['link-cleaner']);

    const toolbarActions = [
      { id: 'link.copyPage', moduleId: 'link-cleaner', toolbar: true },
      { id: 'task.addPage', moduleId: 'quick-tasks', toolbar: true },
      { id: 'note.add', moduleId: 'slapmemo', toolbar: false }
    ];
    expect(
      filterToolbarActions(toolbarActions, { 'link-cleaner': false }, ['link.copyPage', 'task.addPage']).map(
        a => a.id
      )
    ).toEqual(['task.addPage']);

    const grouped = groupModulesByCategory(modules);
    expect(grouped.map(g => g.label)).toEqual([
      'Notlar',
      'Görevler',
      'Metin',
      'Sekmeler',
      'Odak',
      'Medya',
      'Genel'
    ]);
    expect(grouped.reduce((sum, g) => sum + g.modules.length, 0)).toBe(modules.length);

    const merged = mergeTabItems(
      [{ url: 'https://a.com', label: 'Önemli', updated_at: 100 }],
      [
        { url: 'https://a.com', note: 'Not A', created_at: 50, updated_at: 200 },
        { url: 'https://b.com', note: 'Not B', created_at: 150, updated_at: 150 }
      ]
    );
    expect(merged).toEqual([
      { url: 'https://a.com', label: 'Önemli', note: 'Not A', updated_at: 200 },
      { url: 'https://b.com', label: null, note: 'Not B', updated_at: 150 }
    ]);
  });
});
