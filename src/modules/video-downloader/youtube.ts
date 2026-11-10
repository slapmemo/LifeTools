import { PAGE_THEME } from '../../core/page-theme';
import { cacheFresh, formatChip, formatQualityLabel, menuPosition, MODE_LABELS, youtubePage, youtubePlaylistId, youtubeVideoId, type VideoFormats, type VideoJob } from './logic';

let host: HTMLElement | null = null;
let route = '';
let frame = 0;
let refreshChip: (() => void) | undefined;
const formatsCache = new Map<string, { timestamp: number; data: VideoFormats }>();
const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };

function render(): void {
  const kind = youtubePage(location.href);
  const anchor = kind === 'watch' ? document.querySelector<HTMLElement>('ytd-watch-metadata #title h1, ytd-watch-metadata h1') : kind === 'playlist' ? document.querySelector<HTMLElement>('ytd-playlist-header-renderer h1, yt-page-header-renderer h1, ytd-browse h1') : null;
  const actions = kind === 'shorts' ? document.querySelector<HTMLElement>('ytd-reel-video-renderer[is-active] #actions') : kind === 'playlist' ? document.querySelector<HTMLElement>('ytd-playlist-header-renderer #buttons, ytd-playlist-header-renderer #actions, yt-page-header-renderer #actions, yt-page-header-renderer #buttons, ytd-playlist-header-renderer ytd-button-renderer:has(a[href*="watch"])') : null;
  const watchlist = anchor?.parentElement?.querySelector<HTMLElement>('[data-lifetools-watchlist]');
  const target = watchlist ?? anchor;
  if (kind === 'other' || (!target && !actions)) { host?.remove(); host = null; refreshChip = undefined; return; }
  const correct = actions ? host?.parentElement === actions : host?.previousElementSibling === target;
  if (host?.isConnected && route === location.href && correct) return;
  host?.remove(); route = location.href;
  const wrapper = document.createElement('span'); host = wrapper;
  wrapper.style.cssText = kind === 'shorts' ? 'display:flex;flex-direction:column;align-items:center;margin:8px 0' : 'display:inline-flex;vertical-align:middle;margin:4px 8px';
  const shadow = wrapper.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PAGE_THEME + `:host{position:relative;z-index:1000} .row{display:inline-flex;align-items:center;gap:6px} button{font:inherit;cursor:pointer} .download{font-weight:600;min-height:28px;border:1px solid var(--lt-accent);border-radius:8px;padding:3px 10px;background:var(--lt-accent);color:var(--lt-on-accent);white-space:nowrap} .download:hover{opacity:.88} .shorts{display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:white;padding:0;font-size:12px}.shorts .icon{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#ffffff33;font-size:24px}.menu{position:fixed;z-index:2147483647;min-width:180px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:5px;background:#222;border-radius:8px;box-shadow:0 3px 12px #0008}.menu[hidden]{display:none}.menu button{display:block;width:100%;text-align:left;border:0;border-radius:4px;padding:9px 14px;background:transparent;color:white;font:600 14px Arial}.menu button:hover{background:#555}.chip{display:inline-flex;align-items:center;gap:4px;border-radius:14px;padding:4px 8px;background:#303030;color:white;white-space:nowrap;font:12px Arial}.chip[hidden]{display:none}.cancel{border:0;background:none;color:inherit;font-size:16px;padding:0 2px}`;
  const row = document.createElement('span'); row.className = 'row';
  const button = document.createElement('button'); button.type = 'button'; button.className = kind === 'shorts' ? 'shorts' : 'download';
  if (kind === 'shorts') { const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = '↓'; button.append(icon, 'İndir'); } else button.textContent = kind === 'playlist' ? '↓ Listeyi indir' : '↓ İndir';
  const chip = document.createElement('span'); chip.className = 'chip'; chip.hidden = true;
  const menu = document.createElement('div'); menu.className = 'menu'; menu.hidden = true;
  const position = () => { const p = menuPosition(button.getBoundingClientRect(), menu.getBoundingClientRect(), { width: innerWidth, height: innerHeight }); menu.style.left = `${p.left}px`; menu.style.top = `${p.top}px`; };
  const addItem = (mode: string, label: string, url: string) => {
    const item = document.createElement('button'); item.type = 'button'; item.textContent = label;
    item.addEventListener('click', () => { menu.hidden = true; void chrome.runtime.sendMessage({ type: 'video-downloader:start', url, mode }).then(() => refreshChip?.()).catch(() => {}); }); menu.append(item);
  };
  let request = 0;
  button.addEventListener('click', () => {
    menu.hidden = !menu.hidden;
    if (menu.hidden) { request++; return; }
    const url = location.href; const id = youtubeVideoId(url); const current = ++request;
    const addPlaylist = (separator: boolean) => { const list = youtubePlaylistId(url); if (!list) return; if (separator) { const heading = document.createElement('div'); heading.style.cssText = 'color:#aaa;font:12px Arial;padding:9px 14px 4px;border-top:1px solid #555'; heading.textContent = 'Bu oynatma listesi'; menu.append(heading); } const listUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`; for (const mode of ['playlist:video_best', 'playlist:video_720', 'playlist:audio_mp3'] as const) addItem(mode, MODE_LABELS[mode], listUrl); };
    if (kind === 'playlist') { menu.replaceChildren(); addPlaylist(false); position(); return; }
    const show = (data: VideoFormats) => { menu.replaceChildren(); for (const format of data.formats) addItem(`height:${format.height}`, formatQualityLabel(format.label, format), url); addItem('audio_mp3', formatQualityLabel(MODE_LABELS.audio_mp3, data.audio), url); if (kind === 'watch') addPlaylist(true); position(); };
    const cached = id ? formatsCache.get(id) : undefined;
    if (cached && cacheFresh(cached.timestamp)) { show(cached.data); return; }
    const loading = document.createElement('div'); loading.style.cssText = 'color:white;font:14px Arial;padding:9px 14px'; loading.textContent = 'Kaliteler yükleniyor…'; menu.replaceChildren(loading); position();
    void chrome.runtime.sendMessage({ type: 'video-downloader:formats', url }).then(response => {
      if (current !== request || !wrapper.isConnected || location.href !== url || menu.hidden) return;
      if (!response?.ok) throw Object.assign(new Error(response?.message || 'Kaliteler yüklenemedi.'), { code: response?.code });
      const data = response.data as VideoFormats; if (id) formatsCache.set(id, { timestamp: Date.now(), data }); show(data);
    }).catch(error => {
      if (current !== request || !wrapper.isConnected || location.href !== url || menu.hidden) return;
      menu.replaceChildren(); const message = document.createElement('div'); message.style.cssText = 'color:white;font:14px Arial;padding:9px 14px'; message.textContent = error.message || 'Kaliteler yüklenemedi.'; menu.append(message);
      if (error.code === 'TOOLS_MISSING') { const install = document.createElement('button'); install.type = 'button'; install.textContent = 'Araçları kur'; install.addEventListener('click', () => { install.disabled = true; void chrome.runtime.sendMessage({ type: 'video-downloader:install' }).then(result => { message.textContent = result?.ok ? 'Kurulum başladı. Bir dakika sonra tekrar deneyin.' : result?.message || 'Kurulum başlatılamadı.'; position(); }).catch(() => { message.textContent = 'Kurulum başlatılamadı.'; position(); }); }); menu.append(install); }
      for (const [mode, label] of Object.entries(MODE_LABELS)) if (!mode.startsWith('playlist:')) addItem(mode, label, url); if (kind === 'watch') addPlaylist(true); position();
    });
  });
  for (const event of ['click', 'pointerdown', 'mousedown', 'keydown']) shadow.addEventListener(event, e => e.stopPropagation());
  row.append(button, chip); shadow.append(style, row, menu);
  if (actions) actions.append(wrapper); else target!.insertAdjacentElement('afterend', wrapper);
  refreshChip = () => {
    const page = route;
    void chrome.runtime.sendMessage({ type: 'video-downloader:jobs' }).then(response => {
      if (route !== page || !wrapper.isConnected || !response?.ok) return;
      const jobs = response.jobs as VideoJob[];
      const job = jobs.find(j => j.state === 'running') ?? jobs[0];
      chip.hidden = !job; chip.replaceChildren();
      if (!job) return;
      chip.title = job.state === 'done' ? job.file ?? '' : job.state === 'error' ? job.error ?? '' : '';
      chip.append(document.createTextNode(formatChip(job)));
      if (job.state === 'running') { const cancel = document.createElement('button'); cancel.className = 'cancel'; cancel.type = 'button'; cancel.textContent = '×'; cancel.title = 'İptal'; cancel.setAttribute('aria-label', 'İptal'); cancel.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'video-downloader:cancel', jobId: job.id }).then(() => refreshChip?.()).catch(() => {}); }); chip.append(cancel); }
    }).catch(() => {});
  };
  refreshChip();
}
document.addEventListener('yt-navigate-finish', schedule);
new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', () => { host?.remove(); host = null; schedule(); });
setInterval(() => refreshChip?.(), 1000);
render();
