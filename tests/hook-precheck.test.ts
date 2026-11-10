import { describe, expect, it } from 'vitest';
import { mayContainInstagramVideo } from '../src/modules/instagram/shared';
import { mayContainXVideo } from '../src/modules/x-video/shared';

describe('hook response prechecks', () => {
  it('recognizes Instagram video markers', () => {
    for (const marker of ['video_versions', 'video_dash_manifest', '"video_url"']) expect(mayContainInstagramVideo(marker)).toBe(true);
    expect(mayContainInstagramVideo('{"image_url":"example"}')).toBe(false);
    expect(mayContainInstagramVideo('video_url')).toBe(false);
  });

  it('recognizes X video markers', () => {
    for (const marker of ['video_info', '"variants"']) expect(mayContainXVideo(marker)).toBe(true);
    expect(mayContainXVideo('{"image_url":"example"}')).toBe(false);
    expect(mayContainXVideo('variants')).toBe(false);
  });
});
