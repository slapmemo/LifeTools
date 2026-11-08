import { describe, expect, it } from 'vitest';
import { matchWorkspaces, pills, workspaceForKey } from '../src/modules/tab-manager/workspace-ui';

describe('workspace UI helpers', () => {
  it('matches Turkish folded names and fuzzy subsequences', () => {
    const items = [{name:'Çalışma'}, {name:'İşler'}, {name:'Diğer'}];
    expect(matchWorkspaces(items, 'is').map(x => x.name)).toEqual(['İşler', 'Çalışma']);
    expect(matchWorkspaces(items, 'clsm').map(x => x.name)).toEqual(['Çalışma']);
    expect(matchWorkspaces(items, '')).toEqual(items);
  });
  it('marks the active pill and supplies its color', () => {
    const item = {id:'a', name:'Alan', color:'blue' as const, tabs:[], activeIndex:0, updatedAt:0, count:0};
    expect(pills([item], 'a')[0]).toMatchObject({active:true, hex:'#1a73e8', count:0});
    expect(pills([item], 'b')[0].active).toBe(false);
  });
  it('maps only number keys 1–9 to available items', () => {
    expect(workspaceForKey(['a','b'], '2')).toBe('b');
    expect(workspaceForKey(['a'], '0')).toBeUndefined();
    expect(workspaceForKey(['a'], '9')).toBeUndefined();
  });
});
