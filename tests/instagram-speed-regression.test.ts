import { expect, test, vi } from 'vitest';
import { applyPlaybackSpeed } from '../src/modules/instagram/speed';

test('only assigns the playback rate when it changes', () => {
  let rate = 1;
  const set = vi.fn((value: number) => { rate = value; });
  const video = { get playbackRate() { return rate; }, set playbackRate(value: number) { set(value); } };
  applyPlaybackSpeed(video, 1);
  expect(set).not.toHaveBeenCalled();
  applyPlaybackSpeed(video, 1.5);
  applyPlaybackSpeed(video, 1.5);
  expect(set).toHaveBeenCalledOnce();
  expect(rate).toBe(1.5);
});
