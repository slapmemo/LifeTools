import type { InstagramVideo } from './extract';
import { CHANNEL, INSTAGRAM_ID, SETTINGS_KEY, defaults, validUrl, type Settings } from './shared';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PAGE_THEME } from '../../core/page-theme';
import { setSeekBarsEnabled } from './seek-bar';
const byCode = new Map<string, InstagramVideo[]>();
const byFilename = new Map<string, InstagramVideo>();
const hosts = new Map<HTMLVideoElement, HTMLElement>();
let enabled = true; let settings: Settings = defaults; let frame = 0;
function schedule(): void { if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); }); }
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
  style.textContent = `${PAGE_THEME} .wrap{position:relative;pointer-events:auto} button{font:inherit;cursor:pointer;color:var(--lt-text);background:var(--lt-surface);border:1px solid var(--lt-border);box-shadow:var(--lt-shadow)} .button{border-radius:50%;width:34px;height:34px;font-size:20px;line-height:1} .menu{position:absolute;right:0;top:38px;white-space:nowrap;border-radius:10px;padding:5px;background:var(--lt-surface);box-shadow:var(--lt-shadow)} .row{display:block;border:0;box-shadow:none;padding:8px;border-radius:6px;width:100%} .row:hover{background:var(--lt-sub)} .feedback{position:absolute;right:0;top:38px;white-space:nowrap;padding:6px 9px;border-radius:8px;background:var(--lt-surface);color:var(--lt-text);box-shadow:var(--lt-shadow)}`;
  const wrap = document.createElement('div'); wrap.className = 'wrap'; const button = document.createElement('button'); button.className = 'button'; button.type = 'button'; button.textContent = '↓'; button.title = 'Videoyu indir'; button.setAttribute('aria-label', 'Videoyu indir'); wrap.append(button); root.append(style, wrap);
  const feedback = (text: string) => { wrap.querySelector('.menu, .feedback')?.remove(); const note = document.createElement('div'); note.className = 'feedback'; note.setAttribute('role', 'status'); note.textContent = text; wrap.append(note); if (text !== 'İndiriliyor…') setTimeout(() => note.remove(), 3000); };
  const run = async (items: InstagramVideo[]) => { feedback('İndiriliyor…'); button.disabled = true; let ok = true; for (const item of items) if (!await download(item)) ok = false; button.disabled = false; feedback(ok ? 'İndirildi ✓' : 'Video bulunamadı — sayfayı yenileyip tekrar dene'); };
  button.addEventListener('click', event => { event.stopPropagation(); event.preventDefault(); const items = itemsFor(video); if (!items.length) { feedback('Video bulunamadı — sayfayı yenileyip tekrar dene'); return; } if (items.length === 1) { void run(items); return; }
    if (wrap.querySelector('.menu')) { wrap.querySelector('.menu')?.remove(); return; } wrap.querySelector('.feedback')?.remove(); const menu = document.createElement('div'); menu.className = 'menu';
    const add = (text: string, selected: InstagramVideo[]) => { const row = document.createElement('button'); row.type = 'button'; row.className = 'row'; row.textContent = text; row.addEventListener('click', e => { e.stopPropagation(); void run(selected); }); menu.append(row); };
    add(`Hepsini indir (${items.length})`, items); for (const item of items) add(`${item.index ?? 1}. video`, [item]); wrap.append(menu);
  });
  document.documentElement.append(host); return host;
}
function render(): void {
  for (const video of document.querySelectorAll('video')) {
    const rect = video.getBoundingClientRect(); const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    if (!enabled || !settings.downloadButton || !visible) { hosts.get(video)?.remove(); hosts.delete(video); continue; }
    let host = hosts.get(video); if (!host) { host = create(video); hosts.set(video, host); }
    host.style.top = `${Math.max(0, rect.top + 8)}px`; host.style.left = `${Math.min(innerWidth - 38, rect.right - 42)}px`;
  }
  for (const [video, host] of hosts) if (!video.isConnected) { host.remove(); hosts.delete(video); }
}
window.addEventListener('message', e => { if (e.source !== window || e.origin !== location.origin || e.data?.source !== CHANNEL) return; const m = e.data.media as InstagramVideo; if (!m || typeof m.code !== 'string' || !m.code || typeof m.pk !== 'string' || typeof m.username !== 'string' || typeof m.url !== 'string' || !validUrl(m.url) || !Number.isSafeInteger(m.count) || m.count < 1) return;
  const list = byCode.get(m.code) ?? []; const index = list.findIndex(x => x.index === m.index && x.pk === m.pk); if (index < 0) list.push(m); else list[index] = m; list.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)); byCode.set(m.code, list); const name = new URL(m.url).pathname.split('/').pop(); if (name) byFilename.set(name, m); schedule(); });
new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => !(n instanceof Element) || !n.hasAttribute('data-lifetools-instagram')))) schedule(); }).observe(document, { childList: true, subtree: true });
window.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule); window.addEventListener('popstate', schedule);
async function refresh(): Promise<void> { enabled = await isModuleEnabled(INSTAGRAM_ID); const data = await chrome.storage.local.get({ [SETTINGS_KEY]: defaults }); settings = { ...defaults, ...data[SETTINGS_KEY] }; setSeekBarsEnabled(enabled && settings.seekBar); schedule(); }
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[SETTINGS_KEY])) void refresh(); }); void refresh();
