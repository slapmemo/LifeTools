import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { replaceSiteScript } from '../../core/site-scripts';
import { backgroundDb } from '../../db/host';
import { createSnippetsRepo } from './repo';
export const SMART_REPLIES_ID = 'smart-replies';
export const SITES_KEY = 'smartReplySites';
export const CHANGE_KEY = 'smartReplyChanged';
const ROOT = 'smart-replies-root', PREFIX = 'smart-replies:';
const SCRIPT = 'smart-replies-expander', SCRIPT_FILE = 'smart-replies-content.js';
const repo = createSnippetsRepo(backgroundDb);
function removeMenu(id: string): Promise<void> { return new Promise(resolve => chrome.contextMenus.remove(id, () => { void chrome.runtime.lastError; resolve(); })); }
function createMenu(props: chrome.contextMenus.CreateProperties): Promise<void> { return new Promise(resolve => { chrome.contextMenus.create(props, () => { void chrome.runtime.lastError; resolve(); }); }); }
let sync = Promise.resolve();
function refresh(): void {
  sync = sync.then(async () => {
    await removeMenu(ROOT);
    if (!await isModuleEnabled(SMART_REPLIES_ID)) { await replaceSiteScript(SCRIPT, [], SCRIPT_FILE, true); return; }
    const snippets = await repo.list();
    await createMenu({ id: ROOT, title: 'Şablon ekle', contexts: ['editable'] });
    for (const snippet of snippets.slice(0,10)) await createMenu({ id: PREFIX + snippet.id, parentId: ROOT, title: `${snippet.trigger} — ${snippet.title}`, contexts: ['editable'] });
    const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
    await replaceSiteScript(SCRIPT, data[SITES_KEY] as string[], SCRIPT_FILE, true);
  }).catch(err => { console.debug('[Akıllı Yanıtlar]', err); });
}
export function initSmartRepliesBackground(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const id = String(info.menuItemId); if (!id.startsWith(PREFIX) || tab?.id === undefined) return;
    void (async () => {
      if (!await isModuleEnabled(SMART_REPLIES_ID)) return;
      const snippet = (await repo.list()).find(s => s.id === Number(id.slice(PREFIX.length))); if (!snippet) return;
      try {
        const results = await chrome.scripting.executeScript({ target: { tabId: tab.id!, frameIds: [info.frameId ?? 0] }, args: [snippet.body], func: (body: string) => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement) || (el instanceof HTMLInputElement && el.type === 'password')) return false;
          if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable)) return false;
          if (document.execCommand('insertText', false, body)) return true;
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            if (el.selectionStart === null || el.selectionEnd === null) return false;
            el.setRangeText(body, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); return true;
          }
          return false;
        } });
        if (!results[0]?.result) { flashBadge('!'); return; }
        await repo.incrementUse(snippet.id); refresh(); flashBadge('\u2713');
      } catch { flashBadge('!'); }
    })();
  });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.channel !== 'smart-replies') return false;
    void (async () => {
      if (!await isModuleEnabled(SMART_REPLIES_ID)) return [];
      if (msg.action === 'list' || msg.action === 'used') {
        const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
        let origin = '';
        try { const url = new URL(sender.url ?? ''); origin = `${url.protocol}//${url.hostname}/*`; } catch { return []; }
        if (!(data[SITES_KEY] as string[]).includes(origin) || !await chrome.permissions.contains({ origins: [origin] })) return [];
      }
      if (msg.action === 'list') return repo.list();
      if (msg.action === 'used' && Number.isInteger(msg.id)) { await repo.incrementUse(msg.id); refresh(); }
      return [];
    })().then(respond).catch(() => respond([]));
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[SITES_KEY] || changes[CHANGE_KEY])) refresh(); });
  chrome.runtime.onInstalled.addListener(refresh); chrome.runtime.onStartup.addListener(refresh); refresh();
}
