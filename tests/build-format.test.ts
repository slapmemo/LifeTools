import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

/** Sayfaya enjekte edilen betikler: manifestteki content_scripts ve kodda kaydedilen site betikleri. */
function injectedScripts(): string[] {
  const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8')) as { content_scripts?: Array<{ js?: string[] }> };
  const names = new Set<string>();
  for (const entry of manifest.content_scripts ?? []) for (const js of entry.js ?? []) names.add(js.replace(/\.js$/, ''));
  for (const source of sources('src')) {
    for (const m of source.matchAll(/replaceSiteScript\(\s*'[^']+',[^;]*?'([a-z0-9-]+)\.js'/g)) names.add(m[1]);
    for (const m of source.matchAll(/_FILE\s*=\s*'([a-z0-9-]+)\.js'/g)) names.add(m[1]);
    for (const m of source.matchAll(/registerContentScripts\(\[\{[^\]]*?js:\s*\['([a-z0-9-]+)\.js'\]/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('content script build format', () => {
  it('finds the injected scripts from their real sources', () => {
    const names = injectedScripts();
    for (const known of ['ig-hook', 'ig-ui', 'x-video-hook', 'currency-content', 'video-downloader-youtube', 'video-downloader-yt-main', 'site-toolbar-content', 'smart-replies-content']) {
      expect(names).toContain(known);
    }
  });
  it('builds every injected script as an IIFE', () => {
    const source = readFileSync('build.mjs', 'utf8');
    const iifeBuild = source.match(/format: 'iife',[\s\S]*?\n\}\);/)?.[0];
    expect(iifeBuild).toBeDefined();
    for (const name of injectedScripts()) {
      expect(iifeBuild, name).toContain(`'${name}':`);
    }
  });
});
