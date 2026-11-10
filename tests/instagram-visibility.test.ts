import { describe, expect, it } from 'vitest';
import { clipRect, isExploreGridVideo, isModalDialogRect, isMostlyVisible, isUncovered, type Rect } from '../src/modules/instagram/visibility';

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const viewport = { width: 1000, height: 800 };

describe('Instagram video visibility', () => {
  it('distinguishes modal dialogs from small feed widgets', () => {
    const screen = { width: 1920, height: 911 };
    expect(isModalDialogRect(rect(1580, 851, 1920, 911), screen, false)).toBe(false);
    expect(isModalDialogRect(rect(0, 0, 1000, 800), screen, false)).toBe(true);
    expect(isModalDialogRect(rect(1580, 851, 1920, 911), screen, true)).toBe(true);
    expect(isModalDialogRect(rect(-900, 0, 100, 800), screen, false)).toBe(false);
  });
  it('accepts nearby controls but rejects substantially larger covering layers', () => {
    expect(isUncovered(100, 100)).toBe(true);
    expect(isUncovered(100, 200)).toBe(true);
    expect(isUncovered(100, 300)).toBe(false);
    expect(isUncovered(0, 0)).toBe(false);
  });
  it('hides Explore grid videos but permits dialogs and other paths', () => {
    expect(isExploreGridVideo('/explore/', false)).toBe(true);
    expect(isExploreGridVideo('/explore/search/', false)).toBe(true);
    expect(isExploreGridVideo('/explore', false)).toBe(true);
    expect(isExploreGridVideo('/explore/', true)).toBe(false);
    expect(isExploreGridVideo('/', false)).toBe(false);
    expect(isExploreGridVideo('/reels/', false)).toBe(false);
    expect(isExploreGridVideo('/exploreX', false)).toBe(false);
  });
  it('rejects carousel slides outside the clip or only 30% visible', () => {
    const clip = rect(200, 100, 500, 400);
    const outside = rect(500, 100, 800, 400);
    const partial = rect(410, 100, 710, 400);
    expect(clipRect(outside, [clip], viewport)).toBeNull();
    expect(isMostlyVisible(outside, null)).toBe(false);
    expect(isMostlyVisible(partial, clipRect(partial, [clip], viewport))).toBe(false);
  });
  it('accepts a fully visible video and enforces minimum dimensions', () => {
    const video = rect(200, 100, 500, 400);
    expect(isMostlyVisible(video, clipRect(video, [video], viewport))).toBe(true);
    expect(isMostlyVisible(video, rect(200, 100, 270, 400), 0)).toBe(false);
  });
  it('clips to the viewport and handles empty intersections', () => {
    const video = rect(-100, 100, 300, 400);
    expect(clipRect(video, [], viewport)).toEqual(rect(0, 100, 300, 400));
    expect(isMostlyVisible(video, clipRect(video, [], viewport))).toBe(true);
    expect(clipRect(video, [rect(400, 100, 500, 400)], viewport)).toBeNull();
  });
});
