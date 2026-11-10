import type { InstagramVideo } from './extract';
import { CHANNEL, INSTAGRAM_ID, SETTINGS_KEY, defaults, validUrl, type Settings } from './shared';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PAGE_THEME } from '../../core/page-theme';
import { setSeekBarsEnabled } from './seek-bar';
import { SPEED_KEY, SPEEDS, applyPlaybackSpeed, formatSpeed, nextSpeed, parseSpeed } from './speed';
import { visibleVideoRect } from './visibility';
import { getInstagramPointer, scheduleInstagram as schedule, subscribeInstagram } from './scheduler';
const byCode = new Map<string, InstagramVideo[]>();
const byFilename = new Map<string, InstagramVideo>();
const hosts = new Map<HTMLVideoElement, HTMLElement>();
const speedButtons = new WeakMap<HTMLElement, HTMLButtonElement>();
const closeSpeedMenus = new WeakMap<HTMLElement, () => void>();
const updateSpeedMenus = new WeakMap<HTMLElement, () => void>();
let enabled = true; let settings: Settings = defaults;
let speed = 1; let speedReady = false;
const managed = new Map<HTMLVideoElement, () => void>();
let unsubscribe: (() => void) | undefined;
function applySpeed(video: HTMLVideoElement): void { applyPlaybackSpeed(video, speed); }
function updateSpeedLabels(): void { for (const host of hosts.values()) { const button = speedButtons.get(host); if (button) button.textContent = formatSpeed(speed); updateSpeedMenus.get(host)?.(); } }
function setSpeed(value: number): void {
  speed = parseSpeed(value);
  for (const video of managed.keys()) applySpeed(video);
  updateSpeedLabels();
  void chrome.storage.local.set({ [SPEED_KEY]: speed });
  schedule();
}
function manageVideos(found: Iterable<HTMLVideoElement>): void {
  const active = enabled && settings.speedControl && speedReady;
  for (const [video, cleanup] of managed) if (!active || !video.isConnected) { cleanup(); managed.delete(video); }
  if (!active) return;
  for (const video of found) if (!managed.has(video)) {
    const apply = () => applySpeed(video);
    for (const name of ['play', 'loadedmetadata', 'ratechange']) video.addEventListener(name, apply);
    managed.set(video, () => { for (const name of ['play', 'loadedmetadata', 'ratechange']) video.removeEventListener(name, apply); });
    apply();
  }
}
document.addEventListener('pointerdown', e => { for (const host of hosts.values()) if (!e.composedPath().includes(host)) closeSpeedMenus.get(host)?.(); }, true);
document.addEventListener('keydown', e => {
  const pointer = getInstagramPointer();
  if (e.key === 'Escape') { for (const host of hosts.values()) closeSpeedMenus.get(host)?.(); return; }
  if (!enabled || !settings.speedControl || !speedReady || !pointer || !e.shiftKey || (e.key !== '>' && e.key !== '<') || e.altKey || e.ctrlKey || e.metaKey) return;
  const target = e.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || target?.isContentEditable) return;
  const video = [...managed.keys()].find(v => { const raw = v.getBoundingClientRect(); if (pointer!.x < raw.left || pointer!.x > raw.right || pointer!.y < raw.top || pointer!.y > raw.bottom) return false; const r = visibleVideoRect(v); return r && pointer!.x >= r.left && pointer!.x <= r.right && pointer!.y >= r.top && pointer!.y <= r.bottom; });
  if (!video) return;
  e.preventDefault(); e.stopPropagation(); setSpeed(nextSpeed(speed, e.key === '>' ? 1 : -1));
}, true);
function codeFor(video: HTMLVideoElement): string | undefined {
  const container = video.closest('article, [role="dialog"], [class*="reel"]');
  const link = container?.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
  return (link?.getAttribute('href') ?? location.pathname).match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
}
function itemsFor(video: HTMLVideoElement): InstagramVideo[] {
  const code = codeFor(video); if (code && byCode.has(code)) return byCode.get(code)!;
  try { const name = new URL(video.currentSrc || video.src).pathname.split('/').pop() ?? ''; const item = byFilename.get(name); return item ? byCode.get(item.code) ?? [item] : []; } catch { return []; }
}
async function download(item: InstagramVideo): Promise<boolean> {
  try { return (await chrome.runtime.sendMessage({ channel: CHANNEL, action: 'download', ...item }))?.ok === true; } catch { return false; }
}
function create(video: HTMLVideoElement): HTMLElement {
  const host = document.createElement('div'); host.dataset.lifetoolsInstagram = ''; host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' }); const style = document.createElement('style');
  style.textContent = `${PAGE_THEME} .wrap{position:relative;pointer-events:auto;display:flex;gap:4px} button{font:inherit;cursor:pointer;color:var(--lt-text);background:var(--lt-surface);border:1px solid var(--lt-border);box-shadow:var(--lt-shadow)} .button{border-radius:50%;width:34px;height:34px;font-size:20px;line-height:1} .speed{border-radius:17px;height:34px;min-width:40px;padding:0 7px;font-size:12px}.menu{position:absolute;right:0;top:38px;white-space:nowrap;border-radius:10px;padding:5px;background:var(--lt-surface);box-shadow:var(--lt-shadow)} .row{display:block;border:0;box-shadow:none;padding:8px;border-radius:6px;width:100%} .row:hover{background:var(--lt-sub)} .feedback{position:absolute;right:0;top:38px;white-space:nowrap;padding:6px 9px;border-radius:8px;background:var(--lt-surface);color:var(--lt-text);box-shadow:var(--lt-shadow)}`;
  const wrap = document.createElement('div'); wrap.className = 'wrap'; const button = document.createElement('button'); button.className = 'button'; button.type = 'button'; button.textContent = '↓'; button.title = 'Videoyu indir'; button.setAttribute('aria-label', 'Videoyu indir'); wrap.append(button); const speedButton = document.createElement('button'); speedButton.className = 'speed'; speedButton.type = 'button'; speedButton.title = 'Hız'; speedButton.setAttribute('aria-label', 'Video hızını değiştir'); speedButton.setAttribute('aria-haspopup', 'menu'); speedButton.setAttribute('aria-expanded', 'false'); wrap.append(speedButton); root.append(style, wrap);
  const closeSpeedMenu = () => { wrap.querySelector('.speed-menu')?.remove(); speedButton.setAttribute('aria-expanded', 'false'); };
  closeSpeedMenus.set(host, closeSpeedMenu);
  updateSpeedMenus.set(host, () => { for (const row of wrap.querySelectorAll<HTMLButtonElement>('.speed-menu .row')) { const selected = Number(row.dataset.speed) === speed; row.setAttribute('aria-checked', String(selected)); row.style.fontWeight = selected ? 'bold' : ''; } });
  speedButton.addEventListener('click', () => {
    if (wrap.querySelector('.speed-menu')) { closeSpeedMenu(); return; }
    wrap.querySelector('.menu, .feedback')?.remove();
    const menu = document.createElement('div'); menu.className = 'menu speed-menu'; menu.setAttribute('role', 'menu'); menu.style.pointerEvents = 'auto'; menu.style.maxHeight = `${Math.max(0, innerHeight - 8)}px`; menu.style.overflowY = 'auto';
    for (const value of SPEEDS) { const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.dataset.speed = String(value); row.setAttribute('role', 'menuitemradio'); row.textContent = formatSpeed(value) + (value === 1 ? ' (normal)' : ''); row.addEventListener('click', () => { setSpeed(value); closeSpeedMenu(); }); menu.append(row); }
    wrap.append(menu); speedButton.setAttribute('aria-expanded', 'true'); updateSpeedMenus.get(host)?.();
    const rect = menu.getBoundingClientRect(); if (rect.bottom > innerHeight && speedButton.getBoundingClientRect().top > innerHeight - speedButton.getBoundingClientRect().bottom) { menu.style.top = 'auto'; menu.style.bottom = '38px'; menu.style.maxHeight = `${Math.max(0, speedButton.getBoundingClientRect().top - 4)}px`; } else { menu.style.maxHeight = `${Math.max(0, innerHeight - rect.top - 4)}px`; }
  });
  speedButton.addEventListener('wheel', event => { if (event.deltaY === 0) return; event.preventDefault(); event.stopPropagation(); setSpeed(nextSpeed(speed, event.deltaY < 0 ? 1 : -1)); }, { passive: false });
  for (const name of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) wrap.addEventListener(name, event => { event.preventDefault(); event.stopPropagation(); });
  speedButtons.set(host, speedButton);
  const feedback = (text: string) => { wrap.querySelector('.menu, .feedback')?.remove(); const note = document.createElement('div'); note.className = 'feedback'; note.setAttribute('role', 'status'); note.textContent = text; wrap.append(note); if (text !== 'İndiriliyor…') setTimeout(() => note.remove(), 3000); };
  const run = async (items: InstagramVideo[]) => { feedback('İndiriliyor…'); button.disabled = true; let ok = true; for (const item of items) if (!await download(item)) ok = false; button.disabled = false; feedback(ok ? 'İndirildi ✓' : 'Video bulunamadı — sayfayı yenileyip tekrar dene'); };
  button.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); closeSpeedMenu(); const items = itemsFor(video); if (!items.length) { feedback('Video bulunamadı — sayfayı yenileyip tekrar dene'); return; } if (items.length === 1) { void run(items); return; }
    if (wrap.querySelector('.menu')) { wrap.querySelector('.menu')?.remove(); return; } wrap.querySelector('.feedback')?.remove(); const menu = document.createElement('div'); menu.className = 'menu';
    const add = (text: string, selected: InstagramVideo[]) => { const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.textContent = text; row.addEventListener('click', e => { e.stopPropagation(); void run(selected); }); menu.append(row); };
    add(`Hepsini indir (${items.length})`, items); for (const item of items) add(`${item.index ?? 1}. video`, [item]); wrap.append(menu);
  });
  button.hidden = !settings.downloadButton; speedButton.hidden = !settings.speedControl; speedButton.textContent = formatSpeed(speed);
  document.documentElement.append(host); return host;
}
function render(found: NodeListOf<HTMLVideoElement>): void {
  manageVideos(found);
  if (!enabled || (!settings.downloadButton && !settings.speedControl)) {
    for (const host of hosts.values()) host.remove();
    hosts.clear();
    return;
  }
  for (const video of found) {
    const rect = visibleVideoRect(video);
    if (!rect) { hosts.get(video)?.remove(); hosts.delete(video); continue; }
    let host = hosts.get(video); if (!host) { host = create(video); hosts.set(video, host); }
    host.style.top = `${Math.max(0, rect.top + 8)}px`; host.style.left = `${Math.max(0, Math.min(innerWidth - 80, rect.right - (settings.downloadButton && settings.speedControl ? 86 : 46)))}px`;
  }
  for (const [video, host] of hosts) if (!video.isConnected) { host.remove(); hosts.delete(video); }
}
window.addEventListener('message', e => { if (e.source !== window || e.origin !== location.origin || e.data?.source !== CHANNEL) return; const m = e.data.media as InstagramVideo; if (!m || typeof m.code !== 'string' || !m.code || typeof m.pk !== 'string' || typeof m.username !== 'string' || typeof m.url !== 'string' || !validUrl(m.url) || !Number.isSafeInteger(m.count) || m.count < 1) return;
  const list = byCode.get(m.code) ?? []; const index = list.findIndex(x => x.index === m.index && x.pk === m.pk); if (index < 0) list.push(m); else list[index] = m; list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)); byCode.set(m.code, list); const name = new URL(m.url).pathname.split('/').pop(); if (name) byFilename.set(name, m); schedule(); });
async function refresh(): Promise<void> { enabled = await isModuleEnabled(INSTAGRAM_ID); const data = await chrome.storage.local.get({ [SETTINGS_KEY]: defaults, [SPEED_KEY]: 1 }); settings = { ...defaults, ...data[SETTINGS_KEY] }; speed = parseSpeed(data[SPEED_KEY]); speedReady = true; window.postMessage({ source: CHANNEL, type: 'hook-enabled', enabled: enabled && settings.downloadButton }, location.origin); for (const host of hosts.values()) host.remove(); hosts.clear(); setSeekBarsEnabled(enabled && settings.seekBar); if (enabled && (settings.downloadButton || settings.speedControl)) { if (!unsubscribe) unsubscribe = subscribeInstagram(render); schedule(); } else { unsubscribe?.(); unsubscribe = undefined; } manageVideos([]); for (const video of managed.keys()) applySpeed(video); }
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[MODULE_FLAGS_KEY] || changes[SETTINGS_KEY]) { void refresh(); return; }
  if (changes[SPEED_KEY]) { speed = parseSpeed(changes[SPEED_KEY].newValue); for (const video of managed.keys()) applySpeed(video); updateSpeedLabels(); }
}); void refresh();
