import { describe, expect, it } from 'vitest';
import { badge, convertPlan, createWorkspace, deleteWorkspace, snapshot, updateWorkspace, workspaceTabs } from '../src/modules/tab-manager/workspaces';

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
});
