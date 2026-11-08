import { isModuleEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createNotesRepo } from '../slapmemo/repo';
import { createTabNotesRepo } from './repo';
import { transferTabNote } from './transfer';
import { canInjectTabPage } from '../../core/tab-page-permission';
import { normalizeUrl } from '../life-browser/tabs';
import { showTabNote } from './note-page';
import { PAGE_THEME } from '../../core/page-theme';
export const TAB_NOTES_ID = 'tab-notes';
export const TRANSFER_KEY = 'tabNotesTransferOnClose';
export const SHOW_NOTE_KEY = 'tabNotesShowOnRevisit';
const MAP_KEY = 'tabNotesTabMap';
type Entry = { url: string; title: string };
let queue = Promise.resolve();
function schedule(fn: () => Promise<void>): void { queue = queue.then(fn).catch(err => console.debug('[Sekme notları]', err)); }
async function map(): Promise<Record<string, Entry>> { return { ...(await chrome.storage.session.get({ [MAP_KEY]: {} }))[MAP_KEY] }; }
async function remember(tab: chrome.tabs.Tab): Promise<void> { if (tab.id === undefined) return; const m = await map(); const previous = m[tab.id]; const url = tab.url || tab.pendingUrl || previous?.url; if (url) m[tab.id] = { url, title: tab.title || previous?.title || url }; await chrome.storage.session.set({ [MAP_KEY]: m }); }
async function seed(): Promise<void> { for (const tab of await chrome.tabs.query({})) await remember(tab); }
async function showNote(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !tab.url || !(await isModuleEnabled(TAB_NOTES_ID)) || !(await chrome.storage.local.get({ [SHOW_NOTE_KEY]: false }))[SHOW_NOTE_KEY] || !(await canInjectTabPage(tab.url))) return;
  const note = await createTabNotesRepo(backgroundDb).get(tab.url);
  if (!note) return;
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showTabNote, args: [tab.url, note.note, PAGE_THEME] }); } catch { /* Sekme kapanmış veya kısıtlı olabilir. */ }
}
export function initTabNotesBackground(): void {
  chrome.tabs.onCreated.addListener(tab => schedule(() => remember(tab)));
  chrome.tabs.onUpdated.addListener((_id, change, tab) => { schedule(() => remember(tab)); if (change.status === 'complete') void showNote(tab); });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type !== 'tab-notes:set' || !sender.tab) return;
    void (async () => {
      if (!(await isModuleEnabled(TAB_NOTES_ID)) || typeof msg.url !== 'string' || typeof msg.note !== 'string' || msg.note.length > 1000 || !sender.tab?.url || normalizeUrl(msg.url) !== normalizeUrl(sender.tab.url)) return { ok: false };
      await createTabNotesRepo(backgroundDb).set(msg.url, msg.note);
      return { ok: true };
    })().catch(() => ({ ok: false })).then(respond);
    return true;
  });
  chrome.tabs.onReplaced.addListener((added, removed) => schedule(async () => { const m = await map(); if (m[removed]) { m[added] = m[removed]; delete m[removed]; await chrome.storage.session.set({ [MAP_KEY]: m }); } }));
  chrome.tabs.onRemoved.addListener(id => schedule(async () => { const m = await map(); const entry = m[id]; delete m[id]; await chrome.storage.session.set({ [MAP_KEY]: m }); if (entry && await isModuleEnabled(TAB_NOTES_ID) && (await chrome.storage.local.get({ [TRANSFER_KEY]: false }))[TRANSFER_KEY]) await transferTabNote(entry.url, entry.title, createTabNotesRepo(backgroundDb), createNotesRepo(backgroundDb)); }));
  chrome.runtime.onStartup.addListener(() => schedule(seed)); chrome.runtime.onInstalled.addListener(() => schedule(seed));
  schedule(seed);
}
