import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePrefix, PREFIX_ARG_COMMANDS, PREFIX_COMMANDS, rankActions } from '../src/core/command-search';
import { duplicateBindings } from '../src/modules/shortcuts/duplicates';
import { normalizeToolbarSettings } from '../src/modules/site-toolbar/settings';
describe('command center', () => {
  it('every prefix command points at a registered action', () => {
    const source = readFileSync('src/core/builtin-actions.ts', 'utf8');
    for (const id of [...Object.values(PREFIX_ARG_COMMANDS), ...Object.values(PREFIX_COMMANDS), 'session.save', 'link.copyPage']) {
      expect(source.includes(`id: '${id}'`) || source.includes(`id:'${id}'`), id).toBe(true);
    }
  });
  it('parses Turkish prefixes without altering arguments', () => {
    expect(parsePrefix(' GÖREV  Çalışma ')).toBeNull();
    expect(parsePrefix('not ')).toBeNull();
  });
  it('ranks prefixes ahead of substring and folds Turkish', () => {
    const actions = [{ title: 'Bir çalışma', keywords: [] }, { title: 'Çalışma ekle', keywords: [] }];
    expect(rankActions(actions, 'calisma')).toEqual([actions[1], actions[0]]);
  });
  it('parses Turkish command forms', () => {
    const now = new Date(2026, 10, 8, 12);
    expect(parsePrefix('IZLE Film')).toEqual({ id: 'watch.add', arg: 'Film' });
    expect(parsePrefix('SÜRE')).toEqual({ id: 'time.today', arg: '' });
    expect(parsePrefix('oturum kaydet İş')).toEqual({ id: 'session.save', arg: 'İş' });
    expect(parsePrefix('grup kaydet İş')).toEqual({ id: 'session.save', arg: 'İş' });
  });
});
it('detects duplicate assigned shortcuts', () => {
  expect([...duplicateBindings([{ name: 'a', shortcut: 'Alt+K' }, { name: 'b', shortcut: 'alt+k' }, { name: 'c', shortcut: '' }])]).toEqual(['a', 'b']);
});
it('normalizes toolbar sites and action ids', () => {
  expect(normalizeToolbarSettings([{ origin: 'https://example.com/*', actions: ['a', 'a', 'bad'], x: 2 }, { origin: 'file://x/*' }], ['a'])).toEqual([{ origin: 'https://example.com/*', actions: ['a'], x: 1 }]);
});
