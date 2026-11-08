import { describe, expect, it } from 'vitest';
import { badge, bindingDecision, convertPlan, createWorkspace, deleteWorkspace, savedTabIds, shouldSaveSnapshot, snapshot, updateWorkspace, workspaceTabs } from '../src/modules/tab-manager/workspaces';

describe('workspace model', () => {
  const base = 'chrome-extension://abc/';
  it('filters and snapshots eligible tabs in order', () => {
    const tabs = [{ url: 'https://b.test', index: 2, active: true, title: 'B' }, { url: 'file:///a', index: 1 }, { url: base + 'tabs.html' }, { url: 'https://p.test', pinned: true }, { url: 'chrome://settings' }, { url: 'chrome://newtab/' }];
    expect(workspaceTabs(tabs, base)).toHaveLength(3);
    const result = snapshot(tabs, base);
    expect(result.tabs.map(t => t.url)).toEqual(['chrome://newtab/', 'file:///a', 'https://b.test']);
    expect(result.activeIndex).toBe(2);
  });
  it('validates creation, updates, deletion and limits', () => {
    const a = createWorkspace([], ' Genel ', 'grey', 'a');
    const b = createWorkspace([a], 'İş', 'blue', 'b');
    expect(a.name).toBe('Genel'); expect(badge(b).text).toBe('İ');
    expect(() => createWorkspace([], '', 'grey', 'x')).toThrow();
    expect(() => updateWorkspace(a, undefined, 'invalid')).toThrow();
    expect(() => deleteWorkspace([a], 'a')).toThrow();
    expect(deleteWorkspace([a, b], 'a', 'b').map(w => w.id)).toEqual(['b']);
    expect(() => createWorkspace(Array(30).fill(a), 'x', 'grey', 'x')).toThrow();
  });
  it('plans groups and excludes pinned or internal tabs', () => {
    const plan = convertPlan([{ groupId: 1, url: 'https://a.test' }, { groupId: 1, url: 'https://b.test', pinned: true }], [{ id: 1, color: 'red' }], base);
    expect(plan[0].name).toBe('Grup 1'); expect(plan[0].tabs).toHaveLength(1);
  });
  it('binds an unused last workspace and restores it only for default tabs', () => {
    const a = { ...createWorkspace([], 'Genel', 'grey', 'a'), tabs: [{ url: 'https://saved.test', title: '' }] };
    expect(bindingDecision([a], 'a', {}, [1], 1, [{ url: 'chrome://newtab/' }], base)).toEqual({ id: 'a', restore: true });
    expect(bindingDecision([a], 'a', {}, [1], 1, [{ url: 'https://session.test' }], base)).toEqual({ id: 'a', restore: false });
    expect(bindingDecision([a], 'a', { 2: 'a' }, [1, 2], 1, [], base)).toEqual({ id: undefined, restore: false });
  });
  it('guards empty and closing snapshots and closes only saved IDs', () => {
    const tabs = [{ id: 1, url: 'about:blank', pendingUrl: 'https://pending.test' }, { id: 2, url: base + 'tabs.html' }, { id: 3, url: 'https://pinned.test', pinned: true }];
    expect(shouldSaveSnapshot([], base, false)).toBe(false);
    expect(shouldSaveSnapshot([{ url: 'chrome://newtab/' }], base, false, [{ url: 'https://saved.test', title: '' }])).toBe(false);
    expect(shouldSaveSnapshot(tabs, base, true)).toBe(false);
    expect(snapshot(tabs, base).tabs[0].url).toBe('https://pending.test');
    expect(savedTabIds(tabs, base)).toEqual([1]);
  });
  it('merges the saved source before deleting and refuses oversized snapshots', () => {
    const a = { ...createWorkspace([], 'A', 'grey', 'a'), tabs: [{ url: 'https://source.test', title: '' }] };
    const b = { ...createWorkspace([a], 'B', 'grey', 'b'), tabs: [{ url: 'https://target.test', title: '' }] };
    expect(deleteWorkspace([a, b], 'a', 'b')[0].tabs.map(t => t.url)).toEqual(['https://target.test', 'https://source.test']);
    expect(() => savedTabIds(Array.from({ length: 301 }, (_, id) => ({ id, url: 'https://test.test' })), base)).toThrow('Bu pencerede çok fazla sekme var (300 sınırı)');
  });
});
