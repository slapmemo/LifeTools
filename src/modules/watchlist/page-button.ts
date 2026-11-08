import { pageToast } from '../../core/page-toast';
import { PAGE_THEME } from '../../core/page-theme';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { detectPageKind, normalizePageUrl, PAGE_BUTTON_KEY, STATUS_TEXT } from './page-logic';
import type { Status } from './repo';

let enabled = false;
let route = '';
let host: HTMLElement | undefined;
let frame = 0;
let generation = 0;
const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; void render(); }); };
async function settings(): Promise<void> {
  const data = await chrome.storage.local.get({ [PAGE_BUTTON_KEY]: false, [MODULE_FLAGS_KEY]: {} });
  enabled = data[PAGE_BUTTON_KEY] === true && resolveEnabled(data[MODULE_FLAGS_KEY], 'watchlist');
  schedule();
}
async function render(): Promise<void> {
  const page = normalizePageUrl(location.href);
  if (!enabled || !page) { host?.remove(); host = undefined; route = ''; generation++; return; }
  const anchor = page.site === 'youtube'
    ? document.querySelector<HTMLElement>('ytd-watch-metadata #title h1, ytd-watch-metadata h1')
    : document.querySelector<HTMLElement>('[data-testid="hero__pageTitle"], h1');
  if (!anchor) { if (route !== page.url) { host?.remove(); host = undefined; route = ''; generation++; } return; }
  if (host?.isConnected && route === page.url) return;
  host?.remove(); route = page.url;
  const current = ++generation;
  const wrapper = document.createElement('span');
  wrapper.dataset.lifetoolsWatchlist = '';
  wrapper.style.cssText = 'display:inline-flex;vertical-align:middle;margin:4px 8px';
  const shadow = wrapper.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PAGE_THEME + 'button{font:inherit;font-weight:600;min-height:28px;border:1px solid var(--lt-accent);border-radius:8px;padding:3px 10px;background:var(--lt-accent);color:var(--lt-on-accent);cursor:pointer;white-space:nowrap}button:hover{opacity:.88}button:disabled{opacity:.5;cursor:default}';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '＋ İzle'; button.disabled = true;
  shadow.append(style, button); anchor.insertAdjacentElement('afterend', wrapper); host = wrapper;
  let id: number | undefined;
  const refreshStatus = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'watchlist:status', url: page.url });
    if (current !== generation || !wrapper.isConnected) return;
    if (!response?.ok) { button.disabled = true; return; }
    id = response.found ? response.id : undefined;
    button.textContent = id !== undefined ? STATUS_TEXT[response.status as Status] : '＋ İzle';
    button.disabled = false;
  };
  button.addEventListener('click', () => { void (async () => {
    button.disabled = true;
    await refreshStatus();
    if (current !== generation || !wrapper.isConnected || button.disabled) return;
    button.disabled = true;
    if (id !== undefined) {
      const result = await chrome.runtime.sendMessage({ type: 'watchlist:cycle', id });
      if (result?.ok) pageToast({ ok: true, title: STATUS_TEXT[result.status as Status] });
      else pageToast({ ok: false });
    } else {
      const title = (anchor.textContent || document.title.replace(/\s*[-|] (?:YouTube|IMDb).*$/, '')).trim().slice(0, 300);
      const kind = detectPageKind(page.site, page.site === 'imdb' ? document.querySelector('main')?.textContent?.slice(0, 3000) ?? '' : '');
      const result = await chrome.runtime.sendMessage({ type: 'watchlist:add', title, url: page.url, kind });
      pageToast(result?.ok ? { ok: true, id: result.id, title: 'İzleme listesine eklendi ✓', undoType: 'watchlist:undo' } : { ok: false });
    }
    await refreshStatus();
  })().catch(() => { button.disabled = false; pageToast({ ok: false }); }); });
  void refreshStatus().catch(() => { button.disabled = true; });
}
new MutationObserver(schedule).observe(document, { childList: true, subtree: true });
document.addEventListener('yt-navigate-finish', schedule);
window.addEventListener('popstate', schedule);
document.addEventListener('lifetools-toast-undo', () => { host?.remove(); host = undefined; schedule(); });
window.addEventListener('focus', () => { if (host) { host.remove(); host = undefined; } schedule(); });
setInterval(() => { if ((normalizePageUrl(location.href)?.url ?? '') !== route) schedule(); }, 500);
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PAGE_BUTTON_KEY] || changes[MODULE_FLAGS_KEY])) void settings(); });
void settings();
