import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

/** Her sayfa ve o sayfada çalışan kaynak dosyaları. */
const PAGES: Record<string, string[]> = {
  'src/panel/panel.html': [
    ...walk('src/panel').filter(f => f.endsWith('.ts')),
    ...walk('src/modules').filter(f => /[\\/]panel\.ts$/.test(f)),
    'src/popup/storage-panel.ts'
  ],
  'src/popup/popup.html': ['src/popup/popup.ts'],
  'src/onboarding/welcome.html': ['src/onboarding/welcome.ts']
};

/** Sayfanın kendi id yardımcısı: popup'ta `el('x')`, rehberde `$('x')`. */
const HELPERS: Record<string, RegExp> = {
  'src/popup/popup.html': /\bel(?:<[^>]+>)?\(\s*'([\w-]+)'\s*\)(\?)?/g,
  'src/onboarding/welcome.html': /\$(?:<[^>]+>)?\(\s*'([\w-]+)'\s*\)(\?)?/g
};

// `querySelector('#id')` ve `getElementById('id')`; ardından `?.` gelenler isteğe bağlı sayılır.
const ID_USE = /(?:querySelector(?:<[^>]+>)?\(\s*['"]#([\w-]+)['"]\s*\)|getElementById\(\s*['"]([\w-]+)['"]\s*\))(\?)?/g;

describe('HTML kimlikleri', () => {
  for (const [html, files] of Object.entries(PAGES)) {
    it(`${html}: kodda zorunlu kullanılan her #id sayfada var`, () => {
      const page = readFileSync(html, 'utf8');
      const missing: string[] = [];
      let checked = 0;
      for (const file of files) {
        const code = readFileSync(file, 'utf8');
        const uses: Array<[string, boolean]> = [...code.matchAll(ID_USE)].map(m => [m[1] ?? m[2], Boolean(m[3])]);
        const helper = HELPERS[html];
        if (helper) for (const m of code.matchAll(helper)) uses.push([m[1], Boolean(m[2])]);
        for (const [id, optional] of uses) {
          // `?.` ile kullanılanlar ve kodun kendisinin oluşturduğu (`.id = 'x'`) öğeler zorunlu değil.
          if (optional || code.includes(`.id = '${id}'`)) continue;
          checked++;
          if (!new RegExp(`\\bid=["']${id}["']`).test(page)) missing.push(`${file}: #${id}`);
        }
      }
      expect(checked).toBeGreaterThan(0);
      expect(missing).toEqual([]);
    });
  }
});
