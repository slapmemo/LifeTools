import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('content script build format', () => {
  it('builds every injected script as an IIFE', () => {
    const source = readFileSync('build.mjs', 'utf8');
    const iifeBuild = source.match(/format: 'iife',[\s\S]*?\n\}\);/)?.[0];
    expect(iifeBuild).toBeDefined();
    for (const name of [
      'x-video-hook', 'x-video-ui', 'smart-replies-content', 'site-toolbar-content',
      'slapmemo-bubble', 'pip-hover-button', 'watchlist-page-button', 'site-blocker-content'
    ]) {
      expect(iifeBuild).toContain(`'${name}':`);
    }
  });
});
