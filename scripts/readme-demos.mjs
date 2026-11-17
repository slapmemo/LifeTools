// README için özellik animasyonlarını hareketli SVG'ye çevirir: design/demos/<id>.svg
// Kaynak: src/onboarding/demos.ts (işaretleme) + demos.css + design/tokens.css (iki tema).
// GitHub README'de betik çalışmaz; bu yüzden imleç hedefleri (data-aim) burada sabit yazılıdır.
// demos.ts'de yerleşim değişirse rehber sayfasında .demo öğelerinin style değerlerini (357 px genişlikte) okuyup AIM'i güncelle.
// Çalıştırma: node scripts/readme-demos.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DEMOS } from '../src/onboarding/demos.ts';

const WIDTH = 357, HEIGHT = 140;
const AIM = {
  slapmemo: { '--sel-x': '208px', '--sel-y': '59px', '--btn-x': '76px', '--btn-y': '86px' },
  'link-cleaner': { '--sel-x': '295px', '--sel-y': '60px', '--btn-x': '151px', '--btn-y': '86px' },
  'life-browser': { '--save-x': '296px', '--save-y': '63px' },
  'tab-manager': { '--new-x': '215px', '--new-y': '21px', '--save-x': '308px', '--save-y': '21px', '--c1-x': '27px', '--c1-y': '52px', '--c2-x': '27px', '--c2-y': '74px' },
  currency: { '--p3-x': '310px', '--p3-y': '107px' },
  'video-downloader': { '--dl-x': '324px', '--dl-y': '73px', '--opt-x': '302px', '--opt-y': '111px' },
  'volume-booster': { '--btn-x': '269px', '--btn-y': '92px' },
  'x-video': { '--dl-x': '318px', '--dl-y': '127px' },
  instagram: { '--dl-x': '71px', '--dl-y': '47px', '--speed-x': '99px', '--speed-y': '47px', '--two-x': '139px', '--two-y': '109px' },
  pip: { '--btn-x': '168px', '--btn-y': '53px' },
};

const css = [readFileSync('design/tokens.css', 'utf8'), readFileSync('src/onboarding/demos.css', 'utf8')].join('\n')
  .replace(/\]\]>/g, '');
// Rehber sayfasındaki genel kurallar (components.css: * { box-sizing: border-box }) burada da geçerli olmalı.
const base = `.demo, .demo * { box-sizing: border-box; } .demo { width: ${WIDTH}px; font-family: var(--font); }`;

mkdirSync('design/demos', { recursive: true });
for (const [id, demo] of Object.entries(DEMOS)) {
  const style = Object.entries(AIM[id] ?? {}).map(([k, v]) => `${k}:${v}`).join(';');
  const html = demo.html.replace(/<svg /g, '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${demo.label.replace(/"/g, '&quot;')}">
<foreignObject x="0" y="0" width="${WIDTH}" height="${HEIGHT}">
<div xmlns="http://www.w3.org/1999/xhtml" class="demo demo-${id}" style="${style}"><style><![CDATA[${css}\n${base}]]></style>${html}</div>
</foreignObject>
</svg>
`;
  writeFileSync(`design/demos/${id}.svg`, svg);
}
console.log(`${Object.keys(DEMOS).length} SVG → design/demos/`);
