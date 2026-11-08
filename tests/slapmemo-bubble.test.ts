import { describe, expect, it } from 'vitest';
import { bubblePosition, shouldShowBubble } from '../src/modules/slapmemo/bubble-logic';

describe('SlapMemo selection bubble', () => {
  it('requires an enabled, non-editable selection on a visible site', () => {
    expect(shouldShowBubble('  merhaba  ', false, 'example.com', [], true)).toBe(true);
    expect(shouldShowBubble(' a ', false, 'example.com', [], true)).toBe(false);
    expect(shouldShowBubble('hello', true, 'example.com', [], true)).toBe(false);
    expect(shouldShowBubble('hello', false, 'example.com', ['example.com'], true)).toBe(false);
    expect(shouldShowBubble('hello', false, 'example.com', [], false)).toBe(false);
  });
  it('positions above the end, falls below and clamps to the viewport', () => {
    const viewport = { width: 300, height: 200 }, size = { width: 80, height: 30 };
    expect(bubblePosition({ left: 120, right: 160, top: 80, bottom: 100 }, viewport, size)).toEqual({ left: 120, top: 42 });
    expect(bubblePosition({ left: 280, right: 300, top: 4, bottom: 20 }, viewport, size)).toEqual({ left: 220, top: 28 });
    expect(bubblePosition({ left: 0, right: 0, top: 0, bottom: 190 }, viewport, size)).toEqual({ left: 0, top: 170 });
  });
});
