import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// build.mjs içe aktarılamaz (çalışınca dist'i değiştirir); ayarlar metinden doğrulanır.
const build = readFileSync('build.mjs', 'utf8');

it('ESM sayfa paketleri kod bölmeyle derlenir (düzenleyici ayrı parça olur)', () => {
  const options = build.match(/const esmPageOptions = \{([\s\S]*?)\};/)?.[1] ?? '';
  expect(options).toContain("format: 'esm'");
  expect(options).toContain('splitting: true');
  expect(options).toContain("chunkNames: 'chunks/[name]-[hash]'");
  // Panel girişi bu ayarlarla derlenen ilk build çağrısındadır.
  expect(build).toMatch(/\.\.\.esmPageOptions,\s*entryPoints: \{[\s\S]*?panel: 'src\/panel\/panel\.ts'/);
});

it('IIFE içerik betikleri bölünmez ve notes.css dist\'e kopyalanır', () => {
  expect(build).toMatch(/format: 'iife',\s*entryPoints/);
  expect(build).toContain("copyFileSync('shared/notes/notes.css', join(dist, 'notes.css'))");
  expect(readFileSync('src/panel/panel.html', 'utf8')).toContain('href="notes.css"');
});
