import { beforeEach, describe, expect, it } from 'vitest';
import { clearActions, filterEnabled, getAction, listActions, registerAction, splitArg, toInfo, type LifeAction } from '../src/core/actions';
import { parsePrefix, rankActions } from '../src/modules/command-center/search';
import { COMMAND_ACTIONS, describeCommands, duplicateBindings } from '../src/modules/shortcuts/duplicates';
import { normalizeToolbarSettings } from '../src/modules/site-toolbar/settings';

const make = (id: string, moduleId: string, extra: Partial<LifeAction> = {}): LifeAction => ({ id, title: id, keywords: [], moduleId, run: () => {}, ...extra });

describe('action registry', () => {
  beforeEach(() => clearActions());

  it('registers, finds and rejects duplicate or malformed ids', () => {
    registerAction(make('note.add', 'slapmemo'));
    expect(getAction('note.add')?.moduleId).toBe('slapmemo');
    expect(listActions()).toHaveLength(1);
    expect(() => registerAction(make('note.add', 'slapmemo'))).toThrow();
    expect(() => registerAction(make('bad id', 'x'))).toThrow();
  });

  it('hides actions of disabled modules and treats missing flags as enabled', () => {
    const actions = [make('a.one', 'm1'), make('b.two', 'm2'), make('c.core', 'core')];
    expect(filterEnabled(actions, { m1: false }).map(a => a.id)).toEqual(['b.two', 'c.core']);
    expect(filterEnabled(actions, undefined)).toHaveLength(3);
    expect(filterEnabled(actions, { m1: false, m2: false }).map(a => a.id)).toEqual(['c.core']);
  });

  it('strips run() from public info', () => {
    expect('run' in toInfo(make('a.one', 'm'))).toBe(false);
  });

  it('splits "head: arg" input', () => {
    expect(splitArg('Not ekle: merhaba: dünya')).toEqual({ head: 'Not ekle', arg: 'merhaba: dünya' });
    expect(splitArg('  görev ekle ')).toEqual({ head: 'görev ekle', arg: '' });
    expect(splitArg('not ekle:')).toEqual({ head: 'not ekle', arg: '' });
  });
});

describe('command center ranking', () => {
  const actions = [
    { title: 'Zombi sekmeleri göster', keywords: ['eski sekmeler'] },
    { title: 'Sekme değiştiriciyi aç', keywords: ['geçiş'] },
    { title: 'Görev ekle: <metin>', keywords: ['gorev', 'yapılacak'] }
  ];
  it('matches Turkish-insensitively on title and keywords', () => {
    expect(rankActions(actions, 'gorev')[0]).toBe(actions[2]);
    expect(rankActions(actions, 'GÖREV')[0]).toBe(actions[2]);
    expect(rankActions(actions, 'gecis')).toEqual([actions[1]]);
    expect(rankActions(actions, 'yapilacak')).toEqual([actions[2]]);
  });
  it('ranks prefix matches before substring matches', () => {
    expect(rankActions(actions, 'sekme')[0]).toBe(actions[1]);
  });
  it('returns nothing for unrelated queries and everything for empty', () => {
    expect(rankActions(actions, 'qqqq')).toEqual([]);
    expect(rankActions(actions, '  ')).toHaveLength(3);
  });
  it('parses note/task prefixes in Turkish and ASCII spellings', () => {
    expect(parsePrefix('not alışveriş listesi')).toEqual({ id: 'note.add', arg: 'alışveriş listesi' });
    expect(parsePrefix('Gorev süt al')).toEqual({ id: 'task.add', arg: 'süt al' });
    expect(parsePrefix('görev')).toBeNull();
    expect(parsePrefix('notlar var')).toBeNull();
  });
});

describe('shortcuts', () => {
  it('flags unassigned and duplicate bindings', () => {
    const rows = describeCommands([
      { name: 'a', description: 'A', shortcut: 'Alt+K' },
      { name: 'b', description: 'B', shortcut: 'alt+k' },
      { name: 'c', description: 'C', shortcut: '' },
      { name: 'd', description: 'D' }
    ]);
    expect(rows.map(r => [r.name, r.assigned, r.duplicate])).toEqual([['a', true, true], ['b', true, true], ['c', false, false], ['d', false, false]]);
    expect(duplicateBindings([{ name: 'x', shortcut: '' }, { name: 'y', shortcut: '' }]).size).toBe(0);
  });
  it('maps manifest commands to action ids', () => {
    expect(COMMAND_ACTIONS['action-link-copy']).toBe('link.copyPage');
    expect(Object.keys(COMMAND_ACTIONS)).toHaveLength(5);
  });
});

describe('toolbar settings', () => {
  it('drops invalid origins, duplicates, unknown actions and clamps positions', () => {
    const result = normalizeToolbarSettings([
      { origin: 'https://a.com/*', actions: ['x', 'x', 'nope'], x: -3, y: 0.5 },
      { origin: 'https://a.com/*', actions: ['x'] },
      { origin: 'https://a.com:8080/*', actions: ['x'] },
      { origin: 'https://*/*', actions: ['x'] },
      'junk', null
    ], ['x']);
    expect(result).toEqual([{ origin: 'https://a.com/*', actions: ['x'], x: 0, y: 0.5 }]);
    expect(normalizeToolbarSettings('nope', ['x'])).toEqual([]);
  });
});
