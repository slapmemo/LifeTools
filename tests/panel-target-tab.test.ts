import { describe, expect, it } from 'vitest';
import { pickTargetTab } from '../src/core/panel-target-tab';
import { isUrlStillOpen } from '../src/modules/tab-notes/transfer';

const ext = 'chrome-extension://abc/';

describe('pickTargetTab', () => {
  it('skips the panel itself and other extension pages, picks the most recently used tab', () => {
    const tabs = [
      { id: 1, url: 'https://a.com/', lastAccessed: 100 },
      { id: 2, url: 'https://b.com/', lastAccessed: 300 },
      { id: 3, url: `${ext}panel.html`, lastAccessed: 900, active: true },
      { id: 4, url: `${ext}tabs.html`, lastAccessed: 800 }
    ];
    expect(pickTargetTab(tabs, ext, 3)?.id).toBe(2);
  });
  it('returns undefined when only extension tabs are open', () => {
    expect(pickTargetTab([{ id: 3, url: `${ext}panel.html` }], ext, 3)).toBeUndefined();
  });
});

describe('isUrlStillOpen', () => {
  it('ignores hash differences', () => {
    expect(isUrlStillOpen('https://a.com/x#one', ['https://b.com/', 'https://a.com/x#two'])).toBe(true);
    expect(isUrlStillOpen('https://a.com/x', ['https://a.com/y', undefined])).toBe(false);
  });
});

import { planMenuUpdate, type ContextMenuItemSpec } from '../src/core/context-menu';

describe('planMenuUpdate', () => {
  const base: ContextMenuItemSpec[] = [
    { id: 'lifetools', title: 'LifeTools', contexts: ['page'] },
    { id: 'g:1', title: '✓ → İş', parentId: 'lifetools', contexts: ['page'] }
  ];
  it('updates titles in place when the structure is unchanged', () => {
    const next = [base[0], { ...base[1], title: '→ İş' }];
    expect(planMenuUpdate(base, next)).toEqual({ kind: 'update', updates: [{ id: 'g:1', title: '→ İş', enabled: true }] });
    expect(planMenuUpdate(base, base)).toEqual({ kind: 'update', updates: [] });
  });
  it('rebuilds when items are added or the first run has no previous tree', () => {
    expect(planMenuUpdate(null, base).kind).toBe('rebuild');
    expect(planMenuUpdate(base, [...base, { id: 'g:2', title: 'x', parentId: 'lifetools', contexts: ['page'] }]).kind).toBe('rebuild');
  });
});

import { isManagerTabUrl, managerTabs } from '../src/modules/tab-manager/manager-tab';

describe('manager tab matching', () => {
  const url = 'chrome-extension://abc/tabs.html';
  it('ignores query and hash, and keeps the leftmost tab first', () => {
    expect(isManagerTabUrl(`${url}#x`, url)).toBe(true);
    expect(isManagerTabUrl(`${url}?a=1`, url)).toBe(true);
    expect(isManagerTabUrl('chrome-extension://abc/panel.html', url)).toBe(false);
    const tabs = [{ id: 3, url, index: 5 }, { id: 1, pendingUrl: url, index: 0 }, { id: 2, url: 'https://a.test/', index: 1 }];
    expect(managerTabs(tabs, url).map(t => t.id)).toEqual([1, 3]);
  });
});
