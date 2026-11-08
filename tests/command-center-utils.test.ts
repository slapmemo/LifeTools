import { describe, expect, it } from 'vitest';
import { parsePrefix, parseTurkishDue, rankActions } from '../src/modules/command-center/search';
import { duplicateBindings } from '../src/modules/shortcuts/duplicates';
import { normalizeToolbarSettings } from '../src/modules/site-toolbar/settings';
describe('command center', () => {
  it('parses Turkish prefixes without altering arguments', () => {
    expect(parsePrefix(' GÖREV  Çalışma ')).toEqual({ id: 'task.add', arg: 'Çalışma' });
    expect(parsePrefix('not ')).toBeNull();
  });
  it('ranks prefixes ahead of substring and folds Turkish', () => {
    const actions = [{ title: 'Bir çalışma', keywords: [] }, { title: 'Çalışma ekle', keywords: [] }];
    expect(rankActions(actions, 'calisma')).toEqual([actions[1], actions[0]]);
  });
  it('parses dates, times and Turkish command forms', () => {
    const now = new Date(2026, 10, 8, 12);
    expect(parseTurkishDue('Faturayı öde yarın 09:30', now)).toEqual({ title: 'Faturayı öde', due: '2026-11-09 09:30' });
    expect(parseTurkishDue('Ara pazartesi', now)).toEqual({ title: 'Ara', due: '2026-11-09' });
    expect(parseTurkishDue('Ara 01.01', now)).toEqual({ title: 'Ara', due: '2027-01-01' });
    expect(parseTurkishDue('Ara 31.02', now)).toEqual({ title: 'Ara 31.02', due: null });
    expect(parsePrefix('IZLE Film')).toEqual({ id: 'watch.add', arg: 'Film' });
    expect(parsePrefix('SÜRE')).toEqual({ id: 'time.today', arg: '' });
    expect(parsePrefix('oturum kaydet İş')).toEqual({ id: 'session.save', arg: 'İş' });
  });
});
it('detects duplicate assigned shortcuts', () => {
  expect([...duplicateBindings([{ name: 'a', shortcut: 'Alt+K' }, { name: 'b', shortcut: 'alt+k' }, { name: 'c', shortcut: '' }])]).toEqual(['a', 'b']);
});
it('normalizes toolbar sites and action ids', () => {
  expect(normalizeToolbarSettings([{ origin: 'https://example.com/*', actions: ['a', 'a', 'bad'], x: 2 }, { origin: 'file://x/*' }], ['a'])).toEqual([{ origin: 'https://example.com/*', actions: ['a'], x: 1 }]);
});
