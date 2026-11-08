import { describe, expect, it } from 'vitest';
import { barRect, bufferedPercent, formatTime, pointerTime } from '../src/modules/instagram/seek-bar';

describe('Instagram seek helpers', () => {
  it('positions visible bars and hides invalid or clipped videos', () => {
    const rect = { left: 20, top: 100, bottom: 300, width: 200, height: 200 };
    expect(barRect(rect, 500)).toEqual({ left: 20, top: 264, width: 200 });
    expect(barRect({ ...rect, width: 0 }, 500)).toBeNull();
    expect(barRect({ ...rect, height: 0 }, 500)).toBeNull();
    expect(barRect({ ...rect, top: 500, bottom: 700 }, 500)).toBeNull();
    expect(barRect({ ...rect, top: 400, bottom: 600 }, 500)).toBeNull();
    expect(barRect({ ...rect, top: -200, bottom: 0 }, 500)).toBeNull();
  });
  it('formats seconds and hours', () => {
    expect(formatTime(12)).toBe('0:12'); expect(formatTime(3599)).toBe('59:59'); expect(formatTime(3601)).toBe('1:00:01'); expect(formatTime(Infinity)).toBe('0:00');
  });
  it('maps pointer coordinates and clamps them', () => {
    expect(pointerTime(150, 100, 100, 60)).toBe(30); expect(pointerTime(50, 100, 100, 60)).toBe(0); expect(pointerTime(250, 100, 100, 60)).toBe(60); expect(pointerTime(1, 0, 0, 60)).toBe(0);
  });
  it('clamps buffered percentages and handles live streams', () => {
    expect(bufferedPercent(30, 60)).toBe(50); expect(bufferedPercent(90, 60)).toBe(100); expect(bufferedPercent(-1, 60)).toBe(0); expect(bufferedPercent(30, Infinity)).toBe(0);
  });
});
