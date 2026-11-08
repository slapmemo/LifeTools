// esbuild ile src/ -> dist/ (yüklenebilir, paketlenmemiş eklenti).
import { build } from 'esbuild';
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: {
    background: 'src/background.ts',
    'x-video-hook': 'src/modules/x-video/x-video-hook.ts',
    'x-video-ui': 'src/modules/x-video/x-video-ui.ts',
    'smart-replies-content': 'src/modules/smart-replies/content.ts',
    popup: 'src/popup/popup.ts',
    panel: 'src/panel/panel.ts',
    'site-toolbar-content': 'src/modules/site-toolbar/content.ts',
    'slapmemo-bubble': 'src/modules/slapmemo/bubble-content.ts',
    'pip-hover-button': 'src/modules/pip/hover-button.ts',
    'watchlist-page-button': 'src/modules/watchlist/page-button.ts',
    blocked: 'src/modules/site-blocker/blocked.ts',
    'site-blocker-content': 'src/modules/site-blocker/content.ts',
    switcher: 'src/modules/tab-switcher/switcher.ts',
    'command-center': 'src/modules/command-center/command-center.ts',
    offscreen: 'src/db/offscreen.ts',
    'db-worker': 'src/db/worker.ts'
  },
  outdir: dist,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome116',
  logLevel: 'info',
  // sqlite-wasm içindeki yalnızca Node ortamına özgü dinamik importlar.
  external: ['node:*', 'fs', 'path', 'module', 'url', 'os', 'crypto', 'util', 'worker_threads', 'child_process']
});

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
if (existsSync('src/manifest.key.txt')) manifest.key = readFileSync('src/manifest.key.txt', 'utf8').trim();
else console.warn('src/manifest.key.txt bulunamadı; eklenti sabit kimlik olmadan derleniyor.');
writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync('src/modules/tab-switcher/switcher.html', join(dist, 'switcher.html'));
copyFileSync('src/modules/tab-switcher/switcher.css', join(dist, 'switcher.css'));
copyFileSync('src/modules/command-center/command-center.html', join(dist, 'command-center.html'));
copyFileSync('src/modules/command-center/command-center.css', join(dist, 'command-center.css'));
copyFileSync('design/tokens.css', join(dist, 'tokens.css'));
copyFileSync('design/components.css', join(dist, 'components.css'));
copyFileSync('src/panel/panel.html', join(dist, 'panel.html'));
copyFileSync('src/panel/panel.css', join(dist, 'panel.css'));
copyFileSync('src/popup/popup.html', join(dist, 'popup.html'));
copyFileSync('src/popup/popup.css', join(dist, 'popup.css'));
copyFileSync('src/db/offscreen.html', join(dist, 'offscreen.html'));
copyFileSync('src/modules/site-blocker/blocked.html', join(dist, 'blocked.html'));
copyFileSync('src/modules/site-blocker/blocked.css', join(dist, 'blocked.css'));
cpSync('legacy-x-prototype/icons', join(dist, 'icons'), { recursive: true });

function findFile(dir, name) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry === name) {
      return full;
    }
  }
  return null;
}

const pkgDir = 'node_modules/@sqlite.org/sqlite-wasm';
const wasm = existsSync(pkgDir) ? findFile(pkgDir, 'sqlite3.wasm') : null;
if (!wasm) throw new Error('sqlite3.wasm bulunamadı. Önce `npm install` çalıştırın.');
copyFileSync(wasm, join(dist, 'sqlite3.wasm'));

console.log('dist/ hazır.');
