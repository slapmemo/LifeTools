import { describe, expect, it } from 'vitest';
import { downloadPath, sanitizeDownloadFolder } from '../src/core/download-path';

describe('download folders', () => {
  it('cleans traversal, separators and invalid Windows characters', () => {
    expect(sanitizeDownloadFolder(' /../a\\b<>:"|?*/.c./ ')).toBe('a/b/c');
    expect(sanitizeDownloadFolder('../.../')).toBe('');
    expect(sanitizeDownloadFolder('a'.repeat(120))).toHaveLength(100);
  });
  it('joins a filename only when a folder exists', () => {
    expect(downloadPath('', 'video.mp4')).toBe('video.mp4');
    expect(downloadPath('/a/b/', 'video.mp4')).toBe('a/b/video.mp4');
  });
});
