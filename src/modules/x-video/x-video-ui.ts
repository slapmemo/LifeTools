import type { VideoMedia, Variant } from './extract';
import { CHANNEL, X_VIDEO_ID, SETTINGS_KEY, defaults, label, sortVariants, selectVariant, validUrl, type Settings } from './shared';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
const media = new Map<string, VideoMedia[]>(); let enabled = true; let settings: Settings = defaults; let timer: ReturnType<typeof setTimeout> | undefined;
async function refreshSettings(): Promise<void> { enabled = await isModuleEnabled(X_VIDEO_ID); const data = await chrome.storage.local.get({[SETTINGS_KEY]: defaults}); settings = {...defaults, ...data[SETTINGS_KEY]}; schedule(); }
function schedule(): void { if (!timer) timer = setTimeout(() => { timer = undefined; render(); }, 150); }
function download(m: VideoMedia, v: Variant): void { void chrome.runtime.sendMessage({channel:CHANNEL, action:'download', url:v.url, screenName:m.screenName, tweetId:m.tweetId, res:label(v)}).catch(() => {}); }
function render(): void {
 document.querySelectorAll<HTMLElement>('[data-lifetools-x-video]').forEach(e => e.remove()); if (!enabled) return;
 for (const article of document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')) {
  const link = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]:has(time)'); const id = link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1]; const items = id ? media.get(id) : undefined; const bar = article.querySelector<HTMLElement>('[role="group"]'); if (!items?.length || !bar) continue;
  const wrap = document.createElement('span'); wrap.dataset.lifetoolsXVideo = 'true'; wrap.style.cssText = 'position:relative;display:inline-block';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'İndir'; button.style.cssText = 'background:transparent;color:inherit;border:0;cursor:pointer;padding:6px'; wrap.append(button); bar.append(wrap);
  button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const variants = items.flatMap(m => sortVariants(m.variants).map(v => ({m,v}))); if (!variants.length) { button.textContent = 'Bu video indirilemiyor (yalnızca akış)'; return; }
   if (settings.oneClick && items.length === 1) { const v = selectVariant(items[0].variants, settings.quality); if (v) download(items[0],v); return; }
   const existing = wrap.querySelector('div'); if (existing) { existing.remove(); return; } const menu = document.createElement('div'); menu.style.cssText = 'position:absolute;z-index:9999;background:#15202b;color:white;padding:8px;min-width:120px;border-radius:8px;box-shadow:0 2px 8px #0008';
   for (const {m,v} of variants) { const option = document.createElement('button'); option.type = 'button'; option.textContent = `${items.length > 1 ? (items.indexOf(m)+1) + '. video — ' : ''}${label(v)}`; option.style.cssText = 'display:block;color:inherit;background:transparent;border:0;padding:6px;cursor:pointer'; option.addEventListener('click', ev => { ev.stopPropagation(); download(m,v); menu.remove(); }); menu.append(option); } wrap.append(menu);
  });
 }
}
window.addEventListener('message', e => { if (e.source !== window || e.origin !== location.origin || e.data?.source !== CHANNEL) return; const m = e.data.media as VideoMedia; if (!m || !/^\d+$/.test(m.tweetId) || !Array.isArray(m.variants)) return; m.variants = m.variants.filter(v => v && v.contentType === 'video/mp4' && typeof v.url === 'string' && validUrl(v.url)); const list = media.get(m.tweetId) ?? []; const index = list.findIndex(x => x.mediaKey === m.mediaKey); if (index < 0) list.push(m); else list[index] = m; media.set(m.tweetId,list); schedule(); });
new MutationObserver(records => { if (records.some(r => [...r.addedNodes, ...r.removedNodes].some(n => !(n instanceof Element) || !n.closest('[data-lifetools-x-video]') && !n.hasAttribute('data-lifetools-x-video')))) schedule(); }).observe(document, {childList:true,subtree:true});
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c[MODULE_FLAGS_KEY] || c[SETTINGS_KEY])) void refreshSettings(); }); void refreshSettings();
