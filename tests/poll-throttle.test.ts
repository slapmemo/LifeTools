import { describe, expect, it } from 'vitest';
import { isSnapshotFresh } from '../src/modules/video-downloader/background';
import { shouldCheckSelfUpdate } from '../src/core/self-update';

describe('video job snapshot freshness', () => {
  it('accepts snapshots younger than the limit', () => {
    expect(isSnapshotFresh(8_001, 10_000, 2_000)).toBe(true);
    expect(isSnapshotFresh(8_000, 10_000, 2_000)).toBe(false);
  });
  it('rejects invalid or future timestamps', () => {
    expect(isSnapshotFresh(NaN, 10_000, 2_000)).toBe(false);
    expect(isSnapshotFresh(10_001, 10_000, 2_000)).toBe(false);
  });
});

describe('self-update throttle', () => {
  it('checks when no valid timestamp exists or ten minutes have elapsed', () => {
    expect(shouldCheckSelfUpdate(undefined, 1_000_000)).toBe(true);
    expect(shouldCheckSelfUpdate(NaN, 1_000_000)).toBe(true);
    expect(shouldCheckSelfUpdate(400_000, 1_000_000)).toBe(true);
  });
  it('skips recent checks and handles a clock change', () => {
    expect(shouldCheckSelfUpdate(400_001, 1_000_000)).toBe(false);
    expect(shouldCheckSelfUpdate(1_000_001, 1_000_000)).toBe(true);
  });
});
