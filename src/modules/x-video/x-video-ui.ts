import type { VideoMedia, Variant } from './extract';
import { CHANNEL, X_VIDEO_ID, SETTINGS_KEY, defaults, label, sortVariants, selectVariant, validUrl, type Settings } from './shared';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { computeMenuPosition } from './menu-position';

const media = new Map<string, VideoMedia[]>();
let enabled = true;
let settings: Settings = defaults;
let frame = 0;
let route = location.href;
let openButton: HTMLButtonElement | undefined;
const gifJobs = new Map<string, HTMLButtonElement>();
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.channel !== CHANNEL || msg.action !== 'gif-progress') return;
  const button = gifJobs.get(msg.id); if (button && typeof msg.percent === 'number') { button.textContent = `GIF hazırlanıyor… %${Math.max(0, Math.min(100, Math.round(msg.percent)))}`; button.title = button.textContent; }
});
let scrollX = 0, scrollY = 0, buttonTop = 0, buttonLeft = 0;
const host = document.createElement('div');
host.dataset.lifetoolsXVideo = 'menu';
host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0';
const shadow = host.attachShadow({ mode: 'closed' });
const style = document.createElement('style');
style.textContent = `
:host { font: 14px system-ui,sans-serif }
.menu { box-sizing:border-box;min-width:180px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow-y:auto;border:1px solid rgba(128,128,128,.3);border-radius:12px;box-shadow:0 4px 18px #0006;padding:5px 0 }
.title { padding:10px 14px;font-weight:700 }
.row { display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;border:0;padding:10px 14px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer }
.row:hover,.row:focus-visible { background:rgba(128,128,128,.18);outline:none }
.hint { opacity:.65;font-size:12px;white-space:nowrap }`;
shadow.append(style);
document.documentElement.append(host);

async function refreshSettings(): Promise<void> {
  enabled = await isModuleEnabled(X_VIDEO_ID);
  const data = await chrome.storage.local.get({ [SETTINGS_KEY]: defaults });
  settings = { ...defaults, ...data[SETTINGS_KEY] };
  if (!enabled) closeMenu();
  schedule();
}
function schedule(): void { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
async function download(m: VideoMedia, v: Variant): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ channel: CHANNEL, action: 'download', url: v.url, screenName: m.screenName, tweetId: m.tweetId, res: label(v), mediaIndex: (m.mediaCount ?? 0) > 1 ? m.mediaIndex : undefined });
    return response?.ok === true;
  } catch { return false; }
}
function showSuccess(button: HTMLButtonElement): void {
  const svg = button.querySelector('svg'); if (svg) { const old = svg.innerHTML; svg.innerHTML = '<path d="m5 12 4 4L19 6"/>'; setTimeout(() => { svg.innerHTML = old; }, 1200); }
}
async function downloadGif(button: HTMLButtonElement, m: VideoMedia, v: Variant): Promise<void> {
  const original = button.innerHTML; const id = crypto.randomUUID(); gifJobs.set(id, button); button.disabled = true;
  button.textContent = 'GIF hazırlanıyor… %0'; button.title = button.textContent;
  let ok = false;
  try {
    const response = await chrome.runtime.sendMessage({ channel: CHANNEL, action: 'download-gif', id, url: v.url, screenName: m.screenName, tweetId: m.tweetId, res: label(v), mediaIndex: (m.mediaCount ?? 0) > 1 ? m.mediaIndex : undefined });
    ok = response?.ok === true;
  } catch { /* menu remains available for MP4 */ }
  finally { gifJobs.delete(id); button.innerHTML = original; button.disabled = false; }
  if (ok) { button.title = 'İndir'; showSuccess(button); } else { button.title = 'GIF oluşturulamadı'; openMenu(button, [m]); }
}
async function downloadAll(button: HTMLButtonElement, items: VideoMedia[]): Promise<void> {
  const original = button.innerHTML;
  button.disabled = true;
  let succeeded = true;
  try {
    for (let i = 0; i < items.length; i++) {
      button.textContent = `${i + 1}/${items.length}`;
      const variant = selectVariant(items[i].variants, 'highest');
      if (!variant || !await download(items[i], variant)) succeeded = false;
    }
  } finally {
    button.innerHTML = original; button.disabled = false;
  }
  if (succeeded) showSuccess(button); else button.title = 'Bazı videolar indirilemedi';
}
function closeMenu(restore = false): void {
  shadow.querySelector('.menu')?.remove();
  const button = openButton;
  openButton = undefined;
  if (restore && button?.isConnected) button.focus();
}
function openMenu(button: HTMLButtonElement, items: VideoMedia[]): void {
  if (openButton === button) { closeMenu(true); return; }
  closeMenu();
  const variants = items.flatMap((m, index) => sortVariants(m.variants).map(v => ({ m, v, index })));
  if (!variants.length) { button.title = 'Bu video indirilemiyor (yalnızca akış)'; return; }
  const background = getComputedStyle(document.body).backgroundColor;
  const rgb = background.match(/[\d.]+/g)?.map(Number);
  const light = !!rgb && (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 160;
  const menu = document.createElement('div');
  menu.className = 'menu'; menu.setAttribute('role', 'menu');
  menu.style.background = light ? '#fff' : (rgb && (rgb[3] === undefined || rgb[3] > 0) ? background : '#000');
  menu.style.color = light ? '#0f1419' : '#e7e9ea';
  const title = document.createElement('div'); title.className = 'title'; title.textContent = button.title === 'GIF oluşturulamadı' ? 'GIF oluşturulamadı' : 'Kalite seç'; menu.append(title);
  for (const [index, m] of items.entries()) {
    const variant = m.isGif && selectVariant(m.variants, 'highest');
    if (!variant) continue;
    const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.setAttribute('role', 'menuitem');
    row.textContent = `${items.length > 1 ? `${index + 1}. video — ` : ''}GIF olarak indir`;
    row.addEventListener('click', () => { closeMenu(true); void downloadGif(button, m, variant); }); menu.append(row);
  }
  if (items.length > 1) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.setAttribute('role', 'menuitem');
    row.textContent = `Hepsini indir (${items.length})`;
    row.addEventListener('click', () => { closeMenu(true); void downloadAll(button, items); }); menu.append(row);
  }
  for (const { m, v, index } of variants) {
    const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.setAttribute('role', 'menuitem');
    const name = document.createElement('span'); name.textContent = `${items.length > 1 ? `${index + 1}. video — ` : ''}${label(v)}`; row.append(name);
    if (m.durationMs && v.bitrate) {
      const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = `~${(m.durationMs * v.bitrate / 8000 / 1024 / 1024).toFixed(1)} MB`; row.append(hint);
    }
    row.addEventListener('click', () => { void download(m, v); closeMenu(true); }); menu.append(row);
  }
  menu.addEventListener('keydown', event => {
    const rows = Array.from(menu.querySelectorAll<HTMLButtonElement>('.row'));
    const index = rows.indexOf(shadow.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); rows[(index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length].focus(); }
  });
  shadow.append(menu); openButton = button; scrollX = window.scrollX; scrollY = window.scrollY; buttonTop = button.getBoundingClientRect().top; buttonLeft = button.getBoundingClientRect().left;
  const pos = computeMenuPosition(button.getBoundingClientRect(), menu.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
  host.style.top = `${pos.top}px`; host.style.left = `${pos.left}px`;
  menu.querySelector<HTMLButtonElement>('.row')?.focus();
}
function makeButton(bar: HTMLElement, id: string): void {
  const wrap = document.createElement('div'); wrap.dataset.lifetoolsXVideo = id; wrap.style.cssText = 'display:flex;align-items:center';
  const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', 'Videoyu indir'); button.title = 'İndir';
  const sibling = bar.querySelector('svg'); const color = sibling ? getComputedStyle(sibling).color : 'rgb(113, 118, 123)';
  button.style.cssText = `display:flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:transparent;color:${color || 'rgb(113, 118, 123)'};cursor:pointer`;
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18.75" height="18.75" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>';
  button.addEventListener('mouseenter', () => { button.style.background = 'rgba(143,207,168,0.15)'; button.style.color = '#8FCFA8'; });
  button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; button.style.color = color; });
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation(); const items = media.get(id) ?? [];
    if (!settings.askQuality && items.length) {
      const variant = selectVariant(items[0].variants, 'highest');
      if (variant) {
        closeMenu(); void download(items[0], variant);
        showSuccess(button);
      } else button.title = 'Bu video indirilemiyor (yalnızca akış)';
      return;
    }
    openMenu(button, items);
  });
  const menuButton = document.createElement('button');
  menuButton.type = 'button'; menuButton.textContent = '▾'; menuButton.title = 'İndirme seçenekleri'; menuButton.setAttribute('aria-label', 'İndirme seçenekleri');
  menuButton.style.cssText = `border:0;background:transparent;color:${color};cursor:pointer;padding:4px`;
  menuButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); openMenu(menuButton, media.get(id) ?? []); });
  wrap.append(button, menuButton); bar.append(wrap);
}
function render(): void {
  if (route !== location.href) { route = location.href; closeMenu(); }
  for (const article of document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')) {
    const link = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)');
    const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
    const bar = article.querySelector<HTMLElement>('[role="group"]'); if (!bar) continue;
    const existing = bar.querySelector<HTMLElement>(':scope > [data-lifetools-x-video]');
    if (existing && (!enabled || !id || existing.dataset.lifetoolsXVideo !== id || !media.get(id)?.length)) { if (existing.contains(openButton ?? null)) closeMenu(); existing.remove(); }
    if (enabled && id && media.get(id)?.length && !bar.querySelector(':scope > [data-lifetools-x-video]')) makeButton(bar, id);
  }
  if (openButton && !openButton.isConnected) closeMenu();
}
window.addEventListener('message', e => {
  if (e.source !== window || e.origin !== location.origin || e.data?.source !== CHANNEL) return;
  const m = e.data.media as VideoMedia; if (!m || !/^\d+$/.test(m.tweetId) || !Array.isArray(m.variants)) return;
  m.variants = m.variants.filter(v => v && v.contentType === 'video/mp4' && typeof v.url === 'string' && validUrl(v.url));
  const list = media.get(m.tweetId) ?? []; const index = list.findIndex(x => x.mediaKey === m.mediaKey);
  if (index < 0) list.push(m); else list[index] = m; list.sort((a, b) => (a.mediaIndex ?? 0) - (b.mediaIndex ?? 0)); media.set(m.tweetId, list); schedule();
});
new MutationObserver(records => {
  if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => !(n instanceof Element) || !n.closest('[data-lifetools-x-video]') && !n.hasAttribute('data-lifetools-x-video')))) schedule();
}).observe(document, { childList: true, subtree: true });
document.addEventListener('click', e => { if (openButton && !e.composedPath().includes(host) && !e.composedPath().includes(openButton)) closeMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && openButton) { e.preventDefault(); closeMenu(true); } }, true);
window.addEventListener('scroll', () => { if (openButton) { const rect = openButton.getBoundingClientRect(); if (Math.abs(window.scrollX - scrollX) > 40 || Math.abs(window.scrollY - scrollY) > 40 || Math.abs(rect.top - buttonTop) > 40 || Math.abs(rect.left - buttonLeft) > 40) closeMenu(); } }, true);
window.addEventListener('resize', () => closeMenu());
window.addEventListener('popstate', () => { closeMenu(); schedule(); });
setInterval(() => { if (location.href !== route) { closeMenu(); schedule(); } }, 500);
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c[MODULE_FLAGS_KEY] || c[SETTINGS_KEY])) void refreshSettings(); });
void refreshSettings();

