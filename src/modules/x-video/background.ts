import { isModuleEnabled } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { CHANNEL, X_VIDEO_ID, SETTINGS_KEY, defaults, validUrl, filename } from './shared';
import { ensureOffscreen } from '../../db/host';
const GIF_CHANNEL = 'lifetools:x-gif-offscreen';
const jobs = new Map<string, number>();
export function initXVideoBackground(): void {
 chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.channel !== GIF_CHANNEL || msg.action !== 'progress' || sender.url !== chrome.runtime.getURL('offscreen.html')) return;
  const tab = jobs.get(msg.id);
  if (tab !== undefined && typeof msg.percent === 'number') void chrome.tabs.sendMessage(tab, { channel: CHANNEL, action: 'gif-progress', id: msg.id, percent: msg.percent }).catch(() => {});
 });
 chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.channel !== CHANNEL || (msg.action !== 'download' && msg.action !== 'download-gif')) return;
  void (async () => { try {
   const host = new URL(sender.tab?.url ?? '').hostname;
   if (!/^(www\.)?(x|twitter)\.com$/.test(host) || !await isModuleEnabled(X_VIDEO_ID) || typeof msg.url !== 'string' || !validUrl(msg.url) || (msg.mediaIndex !== undefined && (!Number.isSafeInteger(msg.mediaIndex) || msg.mediaIndex < 0 || msg.mediaIndex > 999))) throw new Error('Geçersiz indirme.');
   const data = await chrome.storage.local.get({[SETTINGS_KEY]: defaults});
   let url = msg.url; let gifUrl: string | undefined;
   if (msg.action === 'download-gif') {
    if (typeof msg.id !== 'string' || msg.id.length > 100 || sender.tab?.id === undefined) throw new Error('Geçersiz istek');
    jobs.set(msg.id, sender.tab.id);
    try {
     await ensureOffscreen();
     const result = await chrome.runtime.sendMessage({ channel: GIF_CHANNEL, action: 'convert', url, id: msg.id });
     if (!result?.ok || typeof result.url !== 'string' || !result.url.startsWith(`blob:${chrome.runtime.getURL('')}`)) throw new Error('GIF oluşturulamadı');
     gifUrl = result.url; url = gifUrl;
    } finally { jobs.delete(msg.id); }
   }
   const revoke = () => { if (gifUrl) void chrome.runtime.sendMessage({ channel: GIF_CHANNEL, action: 'revoke', url: gifUrl }).catch(() => {}); };
   try {
    const name = filename(msg.screenName, msg.tweetId, msg.res, msg.mediaIndex);
    const id = await chrome.downloads.download({url, filename:gifUrl ? name.replace(/\.mp4$/, '.gif') : name, saveAs:data[SETTINGS_KEY]?.saveAs === true});
    if (gifUrl) {
     const listener = (delta: chrome.downloads.DownloadDelta) => { if (delta.id === id && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) { chrome.downloads.onChanged.removeListener(listener); revoke(); } };
     chrome.downloads.onChanged.addListener(listener);
     const [item] = await chrome.downloads.search({id});
     if (item && item.state !== 'in_progress') { chrome.downloads.onChanged.removeListener(listener); revoke(); }
    }
   } catch (error) { revoke(); throw error; }
   flashBadge('\u2713'); respond({ok:true});
  } catch { flashBadge('!'); respond({ok:false}); } })(); return true;
 });
}
