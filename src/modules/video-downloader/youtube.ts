import { PAGE_THEME } from '../../core/page-theme';
import { cacheFresh, estimateFromPlayer, friendlyVideoError, formatChip, formatQualityLabel, menuPosition, MODE_LABELS, playlistRowVideoId, selectionSummary, youtubePage, youtubePlaylistId, youtubeVideoId, type PlayerFormat, type VideoFormats, type VideoJob } from './logic';

let host: HTMLElement | null = null;
let route = '';
let frame = 0;
let refreshChip: (() => void) | undefined;
let selection: { url: string; ids: Set<string>; bar: HTMLElement; update: () => void } | null = null;
function endSelection(): void { selection?.bar.remove(); document.querySelectorAll('[data-lifetools-select]').forEach(el => el.remove()); selection = null; }
function selectionRows(): void {
  if (!selection) return;
  for (const row of document.querySelectorAll<HTMLElement>('ytd-playlist-video-renderer')) {
    if (row.querySelector('[data-lifetools-select]')) continue;
    const link = row.querySelector<HTMLAnchorElement>('a#video-title[href], a#thumbnail[href]'); const id = link && playlistRowVideoId(link.href); if (!id) continue;
    const box = document.createElement('input'); box.type = 'checkbox'; box.setAttribute('data-lifetools-select', ''); box.setAttribute('aria-label', 'Videoyu seç'); box.dataset.videoId = id; box.checked = selection.ids.has(id); box.style.cssText = 'width:20px;height:20px;flex:none;margin:0 12px;accent-color:#3ea6ff;cursor:pointer';
    for (const event of ['click', 'pointerdown', 'mousedown']) box.addEventListener(event, e => e.stopPropagation());
    box.addEventListener('change', () => { if (!selection) return; if (box.checked) selection.ids.add(id); else selection.ids.delete(id); selection.update(); });
    const target = row.querySelector<HTMLElement>('#content') ?? row; target.prepend(box);
  }
}
function beginSelection(url: string, title: string): void {
  endSelection(); const bar = document.createElement('div'); bar.setAttribute('data-lifetools-select-bar', ''); bar.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647'; const shadow = bar.attachShadow({ mode: 'closed' });
  const style = document.createElement('style'); style.textContent = ':host{font:14px Arial;color:white}.bar{background:#282828;box-shadow:0 4px 18px #0009;border-radius:12px;padding:12px;min-width:max-content}.actions{display:flex;align-items:center;gap:8px}button{border:0;border-radius:18px;padding:8px 12px;background:#444;color:white;cursor:pointer}button:hover{background:#555}.primary{background:#3ea6ff;color:#111}.hint{color:#aaa;font-size:12px;margin-top:8px}.menu[hidden]{display:none}.menu button{display:block;width:100%;text-align:left}';
  const container = document.createElement('div'); container.className = 'bar'; const actions = document.createElement('div'); actions.className = 'actions'; const summary = document.createElement('span'); const all = document.createElement('button'); all.textContent = 'Görünenlerin tümünü seç'; const clear = document.createElement('button'); clear.textContent = 'Temizle'; const download = document.createElement('button'); download.className = 'primary'; download.textContent = 'İndir ▾'; const cancel = document.createElement('button'); cancel.textContent = 'Vazgeç'; const menu = document.createElement('div'); menu.className = 'menu'; menu.hidden = true; const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'Uzun listelerde önce aşağı kaydır: YouTube videoları kaydırdıkça yükler.';
  const update = () => { if (!selection) return; summary.textContent = selectionSummary(selection.ids.size); download.disabled = selection.ids.size === 0; document.querySelectorAll<HTMLInputElement>('[data-lifetools-select]').forEach(box => { box.checked = selection!.ids.has(box.dataset.videoId!); }); };
  selection = { url, ids: new Set(), bar, update }; all.onclick = () => { document.querySelectorAll<HTMLInputElement>('[data-lifetools-select]').forEach(box => { if (box.getBoundingClientRect().width && box.getBoundingClientRect().height) selection?.ids.add(box.dataset.videoId!); }); update(); }; clear.onclick = () => { selection?.ids.clear(); update(); }; cancel.onclick = endSelection; download.onclick = () => { menu.hidden = !menu.hidden; };
  for (const mode of ['selected:video_best', 'selected:video_720', 'selected:audio_mp3'] as const) { const item = document.createElement('button'); item.textContent = MODE_LABELS[mode]; item.onclick = () => { if (!selection) return; const ids = [...new Set(Array.from(document.querySelectorAll<HTMLInputElement>('[data-lifetools-select]')).map(box => box.dataset.videoId!).filter(id => selection!.ids.has(id)))]; if (!ids.length || ids.length > 500) { summary.textContent = ids.length > 500 ? 'En fazla 500 video seçilebilir' : selectionSummary(0); return; } void chrome.runtime.sendMessage({ type: 'video-downloader:start', url, mode, items: ids, folderName: title || 'YouTube seçimi' }).then((response: { ok?: boolean; message?: string }) => { if (response?.ok && response.message !== 'İndirme iptal edildi.') { endSelection(); refreshChip?.(); } else summary.textContent = response?.message || 'İndirme başlatılamadı.'; }).catch(() => { summary.textContent = 'İndirme başlatılamadı.'; }); }; menu.append(item); }
  actions.append(summary, all, clear, download, cancel); container.append(actions, menu, hint); shadow.append(style, container); document.documentElement.append(bar); selectionRows(); update();
}
const formatsCache = new Map<string, { timestamp: number; data: VideoFormats }>();
const pending = new Map<string, Promise<VideoFormats>>();
function loadFormats(url: string, id: string): Promise<VideoFormats> {
  const cached = formatsCache.get(id);
  if (cached && cacheFresh(cached.timestamp)) return Promise.resolve(cached.data);
  const existing = pending.get(id); if (existing) return existing;
  const task = new Promise<VideoFormats | null>(resolve => {
    const requestId = crypto.randomUUID();
    const finish = (value: VideoFormats | null) => { clearTimeout(timer); window.removeEventListener('message', receive); resolve(value); };
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'lifetools-yt' || event.data?.type !== 'player-response' || event.data?.id !== requestId || event.data?.videoId !== id) return;
      const data = event.data; const estimate = Array.isArray(data.formats) ? estimateFromPlayer(data.formats as PlayerFormat[], typeof data.duration === 'number' ? data.duration : null) : null;
      if (estimate && typeof data.title === 'string') estimate.title = data.title;
      finish(estimate);
    };
    const timer = setTimeout(() => finish(null), 500);
    window.addEventListener('message', receive);
    window.postMessage({ source: 'lifetools-yt', type: 'player-request', id: requestId, videoId: id }, location.origin);
  }).then(async data => {
    if (!data) { const response = await chrome.runtime.sendMessage({ type: 'video-downloader:formats', url }); if (!response?.ok) throw Object.assign(new Error(response?.message || 'Kaliteler yüklenemedi.'), { code: response?.code }); data = response.data as VideoFormats; }
    formatsCache.set(id, { timestamp: Date.now(), data }); return data;
  }).finally(() => { pending.delete(id); });
  pending.set(id, task); return task;
}
const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); };

function render(): void {
  const kind = youtubePage(location.href);
  if (selection && (kind !== 'playlist' || selection.url !== location.href)) endSelection();
  if (selection) selectionRows();
  const visible = (element: Element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; };
  const browse = kind === 'playlist' ? Array.from(document.querySelectorAll<HTMLElement>('ytd-browse:not([hidden])')).find(element => element.getAttribute('page-subtype') === 'playlist' && visible(element)) ?? Array.from(document.querySelectorAll<HTMLElement>('ytd-browse:not([hidden])')).find(visible) ?? document.body : null;
  const header = browse?.querySelector<HTMLElement>('yt-page-header-view-model, yt-page-header-renderer, ytd-playlist-header-renderer') ?? browse;
  const anchor = kind === 'watch' ? document.querySelector<HTMLElement>('ytd-watch-metadata #title h1, ytd-watch-metadata h1') : kind === 'playlist' ? header?.querySelector<HTMLElement>('h1, yt-dynamic-text-view-model') ?? null : null;
  const newActions = browse?.querySelector<HTMLElement>('.yt-page-header-view-model__page-header-flexible-actions, .page-header-view-model-wiz__page-header-flexible-actions, yt-page-header-view-model yt-flexible-actions-view-model');
  const legacyActions = browse?.querySelector<HTMLElement>('ytd-playlist-header-renderer #buttons, ytd-playlist-header-renderer #top-level-buttons-computed');
  const playLink = header?.querySelector<HTMLElement>('a[href*="/watch"][href*="list="]');
  const playAll = kind === 'playlist' ? Array.from(browse!.querySelectorAll<HTMLElement>('a[aria-label*="Tümünü oynat" i], button[aria-label*="Tümünü oynat" i], a[aria-label*="Play all" i], button[aria-label*="Play all" i]')).find(visible) ?? Array.from(browse!.querySelectorAll<HTMLElement>('a[href*="/watch"][href*="list="]')).find(element => visible(element) && element.getBoundingClientRect().top < 700 && !element.closest('ytd-playlist-video-list-renderer, ytd-playlist-video-renderer')) : undefined;
  let playActions: HTMLElement | null = null;
  let ancestor = playAll?.parentElement ?? null;
  for (let depth = 0; ancestor && depth < 6; depth++, ancestor = ancestor.parentElement) {
    if (Array.from(ancestor.children).filter(child => child.matches('button, a') || child.querySelector('button, a')).length >= 3) { playActions = ancestor; break; }
  }
  const actions = kind === 'shorts' ? document.querySelector<HTMLElement>('ytd-reel-video-renderer[is-active] #actions') : kind === 'playlist' ? playActions ?? newActions ?? legacyActions ?? playLink?.parentElement ?? null : null;
  const watchlist = anchor?.parentElement?.querySelector<HTMLElement>('[data-lifetools-watchlist]');
  const target = watchlist ?? anchor;
  if (kind === 'other' || (kind !== 'playlist' && !target && !actions)) { host?.remove(); host = null; refreshChip = undefined; return; }
  const correct = kind === 'playlist' ? actions ? host?.previousElementSibling === actions : host?.parentElement === document.documentElement : actions ? host?.parentElement === actions : host?.previousElementSibling === target;
  if (host?.isConnected && route === location.href && correct) return;
  host?.remove(); route = location.href;
  const wrapper = document.createElement('span'); host = wrapper;
  wrapper.setAttribute('data-lifetools-video', kind);
  wrapper.style.cssText = kind === 'shorts' ? 'display:flex;flex-direction:column;align-items:center;margin:8px 0' : 'display:inline-flex;vertical-align:middle;margin:4px 8px';
  const shadow = wrapper.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PAGE_THEME + `:host{position:relative;z-index:1000} .row{display:inline-flex;align-items:center;gap:6px} button{font:inherit;cursor:pointer} .download{font-weight:600;min-height:28px;border:1px solid var(--lt-accent);border-radius:8px;padding:3px 10px;background:var(--lt-accent);color:var(--lt-on-accent);white-space:nowrap} .download:hover{opacity:.88} .shorts{display:flex;flex-direction:column;align-items:center;gap:4px;border:0;background:none;color:white;padding:0;font-size:12px}.shorts .icon{display:grid;place-items:center;width:48px;height:48px;border-radius:50%;background:#ffffff33;font-size:24px}.menu{position:fixed;z-index:2147483647;min-width:180px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:5px;background:#222;border-radius:8px;box-shadow:0 3px 12px #0008}.menu[hidden]{display:none}.menu button{display:block;width:100%;text-align:left;border:0;border-radius:4px;padding:9px 14px;background:transparent;color:white;font:600 14px Arial}.menu button:hover{background:#555}.chip{display:inline-flex;align-items:center;gap:4px;border-radius:14px;padding:4px 8px;background:#303030;color:white;white-space:nowrap;font:12px Arial}.chip[hidden]{display:none}.cancel{border:0;background:none;color:inherit;font-size:16px;padding:0 2px}`;
  const row = document.createElement('span'); row.className = 'row';
  const button = document.createElement('button'); button.type = 'button'; button.className = kind === 'shorts' ? 'shorts' : 'download';
  if (kind === 'shorts') { const icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = '↓'; button.append(icon, 'İndir'); } else button.textContent = kind === 'playlist' ? '↓ Listeyi indir' : '↓ İndir';
  if (kind !== 'playlist') button.addEventListener('pointerenter', () => { const url = location.href; const id = youtubeVideoId(url); if (id) void loadFormats(url, id).catch(() => {}); }, { once: true });
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
    if (kind === 'playlist') { menu.replaceChildren(); const select = document.createElement('button'); select.type = 'button'; select.textContent = 'Videoları seç…'; select.addEventListener('click', () => { menu.hidden = true; beginSelection(url, anchor?.textContent?.trim() || 'YouTube seçimi'); }); menu.append(select); addPlaylist(false); position(); return; }
    const show = (data: VideoFormats) => { menu.replaceChildren(); for (const format of data.formats) addItem(`height:${format.height}`, formatQualityLabel(format.label, format), url); addItem('audio_mp3', formatQualityLabel(MODE_LABELS.audio_mp3, data.audio), url); if (kind === 'watch') addPlaylist(true); position(); };
    const cached = id ? formatsCache.get(id) : undefined;
    if (cached && cacheFresh(cached.timestamp)) { show(cached.data); return; }
    const loading = document.createElement('div'); loading.style.cssText = 'color:white;font:14px Arial;padding:9px 14px'; loading.textContent = 'Kaliteler yükleniyor…'; menu.replaceChildren(loading); position();
    void (id ? loadFormats(url, id) : Promise.reject(new Error('Kaliteler yüklenemedi.'))).then(data => {
      if (current !== request || !wrapper.isConnected || location.href !== url || menu.hidden) return;
      show(data);
    }).catch(error => {
      if (current !== request || !wrapper.isConnected || location.href !== url || menu.hidden) return;
      menu.replaceChildren(); const message = document.createElement('div'); message.style.cssText = 'color:white;font:14px Arial;padding:9px 14px'; message.textContent = error.message || 'Kaliteler yüklenemedi.'; menu.append(message);
      if (error.code === 'TOOLS_MISSING') { const install = document.createElement('button'); install.type = 'button'; install.textContent = 'Araçları kur'; install.addEventListener('click', () => { install.disabled = true; void chrome.runtime.sendMessage({ type: 'video-downloader:install' }).then(result => { message.textContent = result?.ok ? 'Kurulum başladı. Bir dakika sonra tekrar deneyin.' : result?.message || 'Kurulum başlatılamadı.'; position(); }).catch(() => { message.textContent = 'Kurulum başlatılamadı.'; position(); }); }); menu.append(install); }
      for (const [mode, label] of Object.entries(MODE_LABELS)) if (!mode.startsWith('playlist:') && !mode.startsWith('selected:')) addItem(mode, label, url); if (kind === 'watch') addPlaylist(true); position();
    });
  });
  for (const event of ['click', 'pointerdown', 'mousedown', 'keydown']) shadow.addEventListener(event, e => e.stopPropagation());
  row.append(button, chip);
  if (kind === 'playlist' && /\b(private|gizli)\b/i.test(header?.textContent ?? '')) { const hint = document.createElement('span'); hint.style.cssText = 'color:#aaa;font:12px Arial'; hint.textContent = 'Gizli liste: indirmek için «Liste dışı» yap'; row.append(hint); }
  shadow.append(style, row, menu);
  if (kind === 'playlist') { if (actions) { wrapper.style.cssText = 'display:flex;margin:10px 0 0'; actions.insertAdjacentElement('afterend', wrapper); } else { wrapper.style.cssText = 'position:fixed;left:24px;bottom:24px;z-index:2147483000'; document.documentElement.append(wrapper); } } else if (actions) actions.append(wrapper); else target!.insertAdjacentElement('afterend', wrapper);
  refreshChip = () => {
    const page = route;
    void chrome.runtime.sendMessage({ type: 'video-downloader:jobs' }).then(response => {
      if (route !== page || !wrapper.isConnected || !response?.ok) return;
      const jobs = response.jobs as VideoJob[];
      const job = jobs.find(j => j.state === 'running') ?? jobs[0];
      chip.hidden = !job; chip.replaceChildren();
      if (!job) return;
      chip.title = job.state === 'done' ? job.file ?? '' : job.state === 'error' ? friendlyVideoError(job.error ?? '') : '';
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
