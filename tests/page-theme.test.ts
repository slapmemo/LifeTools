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

import { pageTheme, toPageThemeMode } from '../src/core/page-theme';

describe('page theme follows the extension choice', () => {
  it('forces dark or light without the system media query', () => {
    const dark = pageTheme('dark');
    expect(dark).toContain('--lt-accent: #a69cff');
    expect(dark).not.toContain('#6258da');
    expect(dark).not.toContain('prefers-color-scheme');
    const light = pageTheme('light');
    expect(light).toContain('--lt-accent: #6258da');
    expect(light).not.toContain('#a69cff');
  });
  it('treats unknown values as system', () => {
    expect(toPageThemeMode('dark')).toBe('dark');
    expect(toPageThemeMode('weird')).toBe('system');
    expect(toPageThemeMode(undefined)).toBe('system');
  });
});
