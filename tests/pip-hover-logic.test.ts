import { describe, expect, it } from 'vitest';
import { bigEnough, pickVideoAt, pipButtonPosition } from '../src/modules/pip/hover-logic';

describe('pipButtonPosition', () => {
  const rect = { left: 20, right: 420, top: 30 };
  it('places the button at the top right on ordinary sites', () => {
    expect(pipButtonPosition(rect, 'example.com')).toEqual({ left: 380, top: 38 });
  });
  it('uses the top left on X and Twitter domains', () => {
    for (const host of ['x.com', 'www.x.com', 'twitter.com', 'mobile.twitter.com'])
      expect(pipButtonPosition(rect, host)).toEqual({ left: 28, top: 38 });
    expect(pipButtonPosition(rect, 'notx.com')).toEqual({ left: 380, top: 38 });
  });
  it('keeps the button inside the visible part of a partly scrolled-off video', () => {
    const view = { width: 1000, height: 800 };
    // Üst kısmı ekranın üstünde kalmış video: düğme ekranın üst kenarından 8 px aşağıda.
    expect(pipButtonPosition({ left: 100, right: 500, top: -150, bottom: 150 }, 'example.com', view)).toEqual({ left: 460, top: 8 });
    // Sağ kısmı ekran dışında: düğme ekranın sağ kenarına yaslanır.
    expect(pipButtonPosition({ left: 700, right: 1300, top: 50, bottom: 400 }, 'example.com', view)).toEqual({ left: 960, top: 58 });
    // Altı da ekran dışında ve çok az görünüyor: düğme görünen kısmın içinde kalır.
    expect(pipButtonPosition({ left: 0, right: 400, top: 780, bottom: 1000 }, 'example.com', view).top).toBe(772);
  });
});

describe('bigEnough', () => {
  it('accepts small players that the old 200×120 limit skipped', () => {
    expect(bigEnough(160, 90)).toBe(true);
    expect(bigEnough(96, 54)).toBe(true);
    expect(bigEnough(95, 200)).toBe(false);
    expect(bigEnough(200, 53)).toBe(false);
  });
});

describe('pickVideoAt', () => {
  const box = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
  it('finds the video under the pointer even when it is covered by an overlay (position based)', () => {
    const player = { id: 'player', rect: box(100, 100, 640, 360) };
    expect(pickVideoAt([player], 300, 200)?.id).toBe('player');
    expect(pickVideoAt([player], 50, 50)).toBeUndefined();
  });
  it('prefers the innermost (smallest) video when several contain the pointer', () => {
    const background = { id: 'bg', rect: box(0, 0, 1920, 1080) };
    const inline = { id: 'inline', rect: box(200, 200, 320, 180) };
    expect(pickVideoAt([background, inline], 300, 250)?.id).toBe('inline');
    expect(pickVideoAt([background, inline], 50, 50)?.id).toBe('bg');
  });
});
