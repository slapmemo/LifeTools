import { describe, expect, it } from 'vitest';
import { parsePrefix, rankActions } from '../src/modules/command-center/search';
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
});
it('detects duplicate assigned shortcuts', () => {
  expect([...duplicateBindings([{ name: 'a', shortcut: 'Alt+K' }, { name: 'b', shortcut: 'alt+k' }, { name: 'c', shortcut: '' }])]).toEqual(['a', 'b']);
});
it('normalizes toolbar sites and action ids', () => {
  expect(normalizeToolbarSettings([{ origin: 'https://example.com/*', actions: ['a', 'a', 'bad'], x: 2 }, { origin: 'file://x/*' }], ['a'])).toEqual([{ origin: 'https://example.com/*', actions: ['a'], x: 1 }]);
});
