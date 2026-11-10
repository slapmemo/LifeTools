import { describe, expect, it } from 'vitest';
import { scrollSettleDelay } from '../src/modules/instagram/scheduler';

describe('Instagram scroll settling', () => {
  it('waits until 300 ms after the last scroll, clamping elapsed time', () => {
    expect(scrollSettleDelay(1000, 1000)).toBe(300);
    expect(scrollSettleDelay(1000, 1200)).toBe(100);
    expect(scrollSettleDelay(1000, 1400)).toBe(0);
  });
});
