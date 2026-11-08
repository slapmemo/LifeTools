import { isModuleEnabled } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { CHANNEL, X_VIDEO_ID, SETTINGS_KEY, defaults, validUrl, filename } from './shared';
export function initXVideoBackground(): void {
 chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.channel !== CHANNEL || msg.action !== 'download') return;
  void (async () => { try {
   const host = new URL(sender.tab?.url ?? '').hostname;
   if (!/^(www\.)?(x|twitter)\.com$/.test(host) || !await isModuleEnabled(X_VIDEO_ID) || typeof msg.url !== 'string' || !validUrl(msg.url) || (msg.mediaIndex !== undefined && (!Number.isSafeInteger(msg.mediaIndex) || msg.mediaIndex < 0 || msg.mediaIndex > 999))) throw new Error('Geçersiz indirme.');
   const data = await chrome.storage.local.get({[SETTINGS_KEY]: defaults});
   await chrome.downloads.download({url:msg.url, filename:filename(msg.screenName, msg.tweetId, msg.res, msg.mediaIndex), saveAs:data[SETTINGS_KEY]?.saveAs === true});
   flashBadge('\u2713'); respond({ok:true});
  } catch { flashBadge('!'); respond({ok:false}); } })(); return true;
 });
}
