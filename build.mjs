// esbuild ile src/ -> dist/ (yüklenebilir, paketlenmemiş eklenti).
import { build } from 'esbuild';
import { cpSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Chrome eklentiyi doğrudan dist/'ten yüklüyor. Derleme önce dist.tmp/'ye yapılır; yalnız her adım
// başarılı olursa dist/ ile yer değiştirir. Yarıda kalan derleme günlük eklentiyi bozmaz.
const finalDist = 'dist';
const dist = 'dist.tmp';
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// Sayfa paketlerinin (ESM) esbuild ayarları; tests/build-options.test.ts metni okur (build.mjs içe aktarılamaz, çalışınca derler).
// splitting: shared/notes/lazy.ts içindeki dinamik import (TipTap düzenleyicisi) ayrı parçaya (dist/chunks/) çıkar;
// panel.js yalnız yazmaya başlanınca o parçayı yükler. Parçalar dist/ altında olduğundan sürüm zip'ine de girer.
const esmPageOptions = {
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]'
};

const sharedOptions = {
  outdir: dist,
  bundle: true,
  platform: 'browser',
  target: 'chrome116',
  logLevel: 'info',
  // sqlite-wasm içindeki yalnızca Node ortamına özgü dinamik importlar.
  external: ['node:*', 'fs', 'path', 'module', 'url', 'os', 'crypto', 'util', 'worker_threads', 'child_process']
};

await build({
  ...sharedOptions,
  ...esmPageOptions,
  entryPoints: {
    background: 'src/background.ts',
    popup: 'src/popup/popup.ts',
    panel: 'src/panel/panel.ts',
    welcome: 'src/onboarding/welcome.ts',
    blocked: 'src/modules/site-blocker/blocked.ts',
    tabs: 'src/modules/tab-manager/tabs.ts',
    offscreen: 'src/db/offscreen.ts',
    'db-worker': 'src/db/worker.ts'
  }
});

await build({
  ...sharedOptions,
  format: 'iife',
  entryPoints: {
    'x-video-hook': 'src/modules/x-video/x-video-hook.ts',
    'x-video-ui': 'src/modules/x-video/x-video-ui.ts',
    'ig-hook': 'src/modules/instagram/ig-hook.ts',
    'ig-ui': 'src/modules/instagram/ig-ui.ts',
    'smart-replies-content': 'src/modules/smart-replies/content.ts',
    'site-toolbar-content': 'src/modules/site-toolbar/content.ts',
    'currency-content': 'src/modules/currency/content.ts',
    'slapmemo-bubble': 'src/modules/slapmemo/bubble-content.ts',
    'pip-hover-button': 'src/modules/pip/hover-button.ts',
    'watchlist-page-button': 'src/modules/watchlist/page-button.ts',
    'video-downloader-youtube': 'src/modules/video-downloader/youtube.ts',
    'video-downloader-yt-main': 'src/modules/video-downloader/yt-main.ts',
    'site-blocker-content': 'src/modules/site-blocker/content.ts'
  }
});

const manifest = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
if (existsSync('src/manifest.key.txt')) manifest.key = readFileSync('src/manifest.key.txt', 'utf8').trim();
else console.warn('src/manifest.key.txt bulunamadı; eklenti sabit kimlik olmadan derleniyor.');
writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync('src/modules/tab-manager/tabs.html', join(dist, 'tabs.html'));
copyFileSync('src/modules/tab-manager/tabs.css', join(dist, 'tabs.css'));
copyFileSync('design/tokens.css', join(dist, 'tokens.css'));
copyFileSync('design/components.css', join(dist, 'components.css'));
copyFileSync('shared/notes/notes.css', join(dist, 'notes.css'));
copyFileSync('src/panel/panel.html', join(dist, 'panel.html'));
copyFileSync('src/panel/panel.css', join(dist, 'panel.css'));
copyFileSync('src/onboarding/welcome.html', join(dist, 'welcome.html'));
copyFileSync('src/onboarding/welcome.css', join(dist, 'welcome.css'));
copyFileSync('src/onboarding/demos.css', join(dist, 'demos.css'));
copyFileSync('src/popup/popup.html', join(dist, 'popup.html'));
copyFileSync('src/popup/popup.css', join(dist, 'popup.css'));
copyFileSync('src/db/offscreen.html', join(dist, 'offscreen.html'));
copyFileSync('src/modules/site-blocker/blocked.html', join(dist, 'blocked.html'));
copyFileSync('src/modules/site-blocker/blocked.css', join(dist, 'blocked.css'));
cpSync('src/icons', join(dist, 'icons'), { recursive: true });
cpSync('design/assets/backgrounds', join(dist, 'assets', 'backgrounds'), { recursive: true });

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

const old = 'dist.old';
rmSync(old, { recursive: true, force: true });
let movedOld = false;
try {
  if (existsSync(finalDist)) { renameSync(finalDist, old); movedOld = true; }
  renameSync(dist, finalDist);
} catch {
  // Yeni klasör yerine konamadıysa eskisini geri getir (Chrome'un okuduğu dist hiç boş kalmasın).
  if (movedOld && !existsSync(finalDist)) {
    try { renameSync(old, finalDist); movedOld = false; } catch { /* aşağıda kopyalanır */ }
  }
  // Klasör kilitliyse (OneDrive, açık dosya) içeriği yerinde değiştir: önce yeni dosyaları üzerine yaz,
  // ancak kopyalama başarılı olunca yeni derlemede olmayan eski dosyaları sil. Kopyalama hata verirse
  // derleme durur, dist eski hâliyle (ya da üzerine yazılmış dosyalarla) kalır, hiçbir dosya silinmez.
  if (!existsSync(finalDist)) mkdirSync(finalDist, { recursive: true });
  cpSync(dist, finalDist, { recursive: true, force: true });
  const fresh = new Set(readdirSync(dist));
  for (const entry of readdirSync(finalDist)) if (!fresh.has(entry)) rmSync(join(finalDist, entry), { recursive: true, force: true });
}
rmSync(dist, { recursive: true, force: true });
rmSync(old, { recursive: true, force: true });

console.log('dist/ hazır.');
