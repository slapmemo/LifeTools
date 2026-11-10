import { isModuleEnabled } from '../../core/module-state';
import { CHANNEL, INSTAGRAM_ID, filename, validUrl } from './shared';
import { downloadPath, loadSubfolder } from '../../core/download-path';
export function initInstagramBackground(): void {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.channel !== CHANNEL || msg.action !== 'download') return;
    void (async () => { try {
      const host = new URL(sender.tab?.url ?? '').hostname;
      if (!/^(www\.)?instagram\.com$/.test(host) || !await isModuleEnabled(INSTAGRAM_ID) || typeof msg.url !== 'string' || !validUrl(msg.url) || typeof msg.username !== 'string' || typeof msg.code !== 'string' || (msg.index !== undefined && (!Number.isSafeInteger(msg.index) || msg.index < 1 || msg.index > 999))) throw new Error('Geçersiz indirme');
      const folder = await loadSubfolder();
      await chrome.downloads.download({ url: msg.url, filename: downloadPath(folder,filename(msg.username, msg.code, msg.index)), saveAs: false }); respond({ ok: true });
    } catch { respond({ ok: false }); } })(); return true;
  });
}
