import { describe, expect, it } from 'vitest';
import { createRateGuard } from '../src/modules/instagram/speed';
import { capMap } from '../src/core/bounded-map';

describe('Instagram ratechange guard', () => {
  it('allows only a few re-applies inside the window, then again after it', () => {
    const guard = createRateGuard(3, 1000);
    expect([guard(0), guard(10), guard(20), guard(30), guard(40)]).toEqual([true, true, true, false, false]);
    expect(guard(1100)).toBe(true);
  });
});

describe('capMap', () => {
  it('drops the oldest entries above the limit', () => {
    const map = new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4]]);
    capMap(map, 2);
    expect([...map.keys()]).toEqual(['c', 'd']);
  });
  it('leaves small maps unchanged', () => {
    const map = new Map([['a', 1]]);
    capMap(map, 2);
    expect([...map.keys()]).toEqual(['a']);
  });
});
