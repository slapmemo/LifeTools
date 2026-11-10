import { describe, expect, it } from 'vitest';
import { downloadPath, resolveSubfolder, sanitizeDownloadFolder } from '../src/core/download-path';

describe('download folders', () => {
  it('cleans traversal, separators and invalid Windows characters', () => {
    expect(sanitizeDownloadFolder(' /../a\\b<>:"|?*/.c./ ')).toBe('a/b/c');
    expect(sanitizeDownloadFolder('../.../')).toBe('');
    expect(sanitizeDownloadFolder('a'.repeat(120))).toHaveLength(100);
  });
  it('resolves the shared subfolder with legacy migration', () => {
    expect(resolveSubfolder('a/b', 'old')).toBe('a/b');
    expect(resolveSubfolder('', 'old')).toBe('');
    expect(resolveSubfolder(undefined, ' old/../x ')).toBe('old/x');
    expect(resolveSubfolder(undefined, undefined)).toBe('');
    expect(resolveSubfolder(5, 7)).toBe('');
  });
  it('joins a filename only when a folder exists', () => {
    expect(downloadPath('', 'video.mp4')).toBe('video.mp4');
    expect(downloadPath('/a/b/', 'video.mp4')).toBe('a/b/video.mp4');
  });
});
