import { describe, expect, it } from 'vitest';
import { bubbleButtons, selectionUrl } from '../src/modules/slapmemo/bubble-logic';

describe('selection bubble buttons', () => {
  it('shows enabled buttons in order, with link cleaning only for URLs', () => {
    expect(bubbleButtons('https://example.com/?utm_source=x', {})).toEqual(['slapmemo', 'quick-tasks', 'watchlist', 'link-cleaner', 'clip-slots']);
    expect(bubbleButtons('some text', { 'quick-tasks': false, 'clip-slots': false })).toEqual(['slapmemo', 'watchlist']);
    expect(bubbleButtons('https://example.com', { 'link-cleaner': false })).not.toContain('link-cleaner');
  });
  it('recognizes only a single HTTP or HTTPS URL', () => {
    expect(selectionUrl(' https://example.com/a ')).toBe('https://example.com/a');
    for (const text of ['https://example.com https://example.org', 'ftp://example.com', 'hello', 'https://example.com\nmore']) expect(selectionUrl(text)).toBeNull();
  });
});
