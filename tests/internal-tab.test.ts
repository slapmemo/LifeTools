import { describe, expect, it } from 'vitest';
import { isInternalTabUrl } from '../src/core/internal-tab';

describe('isInternalTabUrl', () => {
  const base = 'chrome-extension://abc/';
  it('recognizes extension pages including query strings', () => {
    expect(isInternalTabUrl(`${base}tabs.html?x=1`, base)).toBe(true);
    expect(isInternalTabUrl(base, base)).toBe(true);
  });
  it('rejects other extensions, sites, and missing values', () => {
    expect(isInternalTabUrl('chrome-extension://abcd/tabs.html', base)).toBe(false);
    expect(isInternalTabUrl('https://example.com/', base)).toBe(false);
    expect(isInternalTabUrl(undefined, base)).toBe(false);
    expect(isInternalTabUrl('https://example.com/', '')).toBe(false);
  });
});
