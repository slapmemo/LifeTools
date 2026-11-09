import { MODE_LABELS, youtubePage } from './logic';
let host: HTMLElement | null = null;
function render(): void {
  const kind = youtubePage(location.href);
  const target = kind === 'shorts' ? document.querySelector('ytd-reel-video-renderer[is-active] #actions, ytd-reel-video-renderer[is-active]') : document.querySelector('#above-the-fold #top-level-buttons-computed, #below #top-level-buttons-computed, #movie_player');
  if (kind === 'other' || !target) { host?.remove(); host = null; return; }
  if (host?.isConnected && host.parentElement === target) return;
  host?.remove(); host = document.createElement('span');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style'); style.textContent = ':host{display:inline-block;position:relative;z-index:9999;margin:4px} button{cursor:pointer;border:0;border-radius:18px;padding:9px 14px;background:#303030;color:white;font:600 14px Arial} .menu{position:absolute;top:100%;right:0;min-width:180px;padding:5px;background:#222;border-radius:8px;box-shadow:0 3px 12px #0008} .menu button{display:block;width:100%;text-align:left;border-radius:4px} .menu button:hover{background:#555}';
  const button = document.createElement('button'); button.textContent = 'İndir'; button.type = 'button';
  const menu = document.createElement('div'); menu.className = 'menu'; menu.hidden = true;
  for (const [mode, label] of Object.entries(MODE_LABELS)) { const item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.addEventListener('click', () => { menu.hidden = true; void chrome.runtime.sendMessage({ type: 'video-downloader:start', url: location.href, mode }).catch(() => {}); }); menu.append(item); }
  button.addEventListener('click', () => { menu.hidden = !menu.hidden; });
  for (const event of ['click', 'pointerdown', 'mousedown', 'keydown']) shadow.addEventListener(event, e => e.stopPropagation());
  shadow.append(style, button, menu); target.append(host);
}
document.addEventListener('yt-navigate-finish', render);
let lastUrl = location.href;
new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; host?.remove(); host = null; } render(); }).observe(document.documentElement, { childList: true, subtree: true });
render();
