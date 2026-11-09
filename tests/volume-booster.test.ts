import { describe, it, expect } from 'vitest';
import { clampPercent, percentToGain, setVolume, removeVolume } from '../src/modules/volume-booster/logic';
describe('volume booster', () => {
  it('clamps values and converts percentages to gain', () => {
    expect(clampPercent(-1)).toBe(0); expect(clampPercent(700)).toBe(600); expect(clampPercent(NaN)).toBe(100);
    expect(percentToGain(400)).toBe(4); expect(percentToGain(0)).toBe(0);
  });
  it('tracks and removes independent tab values', () => {
    const state = new Map<number, number>(); setVolume(state, 1, 200); setVolume(state, 2, 900); removeVolume(state, 1);
    expect([...state]).toEqual([[2, 600]]);
  });
});
