import { describe, expect, it } from 'vitest';
import { cleanUrl } from '../src/modules/link-cleaner/clean';
import { isShortLink, SHORTENER_ORIGINS } from '../src/modules/link-cleaner/shorteners';

describe('short links', () => {
  it('recognizes each supported HTTPS host', () => {
    for (const origin of SHORTENER_ORIGINS) expect(isShortLink(origin.replace('*', 'abc'))).toBe(true);
  });
  it('rejects unrelated, deceptive and invalid URLs', () => {
    for (const url of ['https://youtu.be/abc', 'https://bit.ly.example/abc', 'https://sub.bit.ly/abc', 'http://bit.ly/abc', 'javascript:alert(1)', 'invalid']) {
      expect(isShortLink(url)).toBe(false);
    }
  });
  it('cleans a resolved address without losing other parameters', () => {
    expect(cleanUrl('https://example.com/path?a=1&utm_source=x&b=two#part')?.url).toBe('https://example.com/path?a=1&b=two#part');
    expect(cleanUrl('javascript:alert(1)')).toBeNull();
  });
});
