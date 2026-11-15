import { describe, expect, it } from 'vitest';
import { dropAction, dragThresholdExceeded, insertionPosition, autoScrollSpeed } from '../src/modules/tab-manager/logic';

describe('dropAction', () => {
  const open = { kind: 'open' as const, windowId: 1, groupId: 2 };
  const saved = { kind: 'saved' as const, sessionId: 3 };
  it('maps all source and target types, including same-card and row drops', () => {
    expect(dropAction(open, { ...open })).toBe('none');
    expect(dropAction(open, { ...open, rowIndex: 4 })).toBe('reorder');
    expect(dropAction(open, { kind: 'open', windowId: 1, groupId: -1 })).toBe('open-to-open');
    expect(dropAction(open, saved)).toBe('open-to-saved');
    expect(dropAction(saved, open)).toBe('saved-to-open');
    expect(dropAction(saved, saved)).toBe('none');
    expect(dropAction(saved, { kind: 'saved', sessionId: 4 })).toBe('saved-to-saved');
  });
});

describe('pointer drag helpers', () => {
  it('starts only beyond five pixels', () => {
    expect(dragThresholdExceeded(0, 0, 3, 4)).toBe(false);
    expect(dragThresholdExceeded(0, 0, 3, 5)).toBe(true);
  });
  it('places the insertion line around the row midpoint', () => {
    expect(insertionPosition(19, { top: 10, height: 20 })).toBe('before');
    expect(insertionPosition(20, { top: 10, height: 20 })).toBe('after');
  });
  it('scrolls toward nearby edges with bounded speed', () => {
    expect(autoScrollSpeed(0, 600)).toBe(-18);
    expect(autoScrollSpeed(30, 600)).toBe(-9);
    expect(autoScrollSpeed(300, 600)).toBe(0);
    expect(autoScrollSpeed(600, 600)).toBe(18);
  });
});
