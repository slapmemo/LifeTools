import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categories, popupVisibility, routeCategory } from '../src/core/ui-visibility';
import { validateTrigger } from '../src/modules/smart-replies/repo';
import { findTriggerAtCaret } from '../src/modules/smart-replies/trigger';
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
});
