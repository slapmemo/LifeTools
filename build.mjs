// esbuild ile src/ -> dist/ (yüklenebilir, paketlenmemiş eklenti).
import { build } from 'esbuild';
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: {
    background: 'src/background.ts',
    'smart-replies-content': 'src/modules/smart-replies/content.ts',
    popup: 'src/popup/popup.ts',
    switcher: 'src/modules/tab-switcher/switcher.ts',
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

copyFileSync('src/manifest.json', join(dist, 'manifest.json'));
copyFileSync('src/modules/tab-switcher/switcher.html', join(dist, 'switcher.html'));
copyFileSync('src/modules/tab-switcher/switcher.css', join(dist, 'switcher.css'));
copyFileSync('src/popup/popup.html', join(dist, 'popup.html'));
copyFileSync('src/popup/popup.css', join(dist, 'popup.css'));
copyFileSync('src/db/offscreen.html', join(dist, 'offscreen.html'));
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
