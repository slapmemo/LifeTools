import { describe, expect, it } from 'vitest';
import { isPrivatePlaylistHeader } from '../src/modules/video-downloader/logic';

describe('playlist privacy', () => {
  it('recognizes the displayed privacy even when other options appear', () => {
    expect(isPrivatePlaylistHeader('Oynatma listesi • Herkese açık • 5 video … Gizli')).toBe(false);
    expect(isPrivatePlaylistHeader('Oynatma listesi • Gizli • 5 video')).toBe(true);
    expect(isPrivatePlaylistHeader('Playlist • Unlisted')).toBe(false);
  });
});
