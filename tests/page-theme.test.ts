import { describe, expect, it } from 'vitest';
import { PAGE_THEME } from '../src/core/page-theme';

describe('page theme', () => {
  it('defines light and dark host colors', () => {
    expect(PAGE_THEME).toContain('--lt-accent: #6258da');
    expect(PAGE_THEME).toContain('@media (prefers-color-scheme: dark)');
    expect(PAGE_THEME).toContain('--lt-accent: #a69cff');
    expect(PAGE_THEME.match(/:host\s*\{/g)).toHaveLength(2);
  });
});
