import { describe, expect, it } from 'vitest';
import { SPEEDS, nextSpeed, parseSpeed } from '../src/modules/instagram/speed';

describe('Instagram video speed', () => {
  it('accepts only supported stored speeds and defaults invalid values to 1', () => {
    for (const speed of SPEEDS) expect(parseSpeed(speed)).toBe(speed);
    for (const value of [undefined, null, '2', NaN, Infinity, 0, 4, 1.1]) expect(parseSpeed(value)).toBe(1);
  });
  it('steps through speeds and clamps at both ends', () => {
    for (let i = 0; i < SPEEDS.length; i++) {
      expect(nextSpeed(SPEEDS[i], 1)).toBe(SPEEDS[Math.min(i + 1, SPEEDS.length - 1)]);
      expect(nextSpeed(SPEEDS[i], -1)).toBe(SPEEDS[Math.max(i - 1, 0)]);
    }
    expect(nextSpeed(NaN, 1)).toBe(1.25);
  });
});
