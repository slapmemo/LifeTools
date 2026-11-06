import { isModuleEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createNotesRepo } from '../slapmemo/repo';
import { createTabNotesRepo } from './repo';
import { transferTabNote } from './transfer';
export const TAB_NOTES_ID = 'tab-notes';
export const TRANSFER_KEY = 'tabNotesTransferOnClose';
const MAP_KEY = 'tabNotesTabMap';
type Entry = { url: string; title: string };
let queue = Promise.resolve();
function schedule(fn: () => Promise<void>): void { queue = queue.then(fn).catch(err => console.debug('[Sekme notları]', err)); }
async function map(): Promise<Record<string, Entry>> { return { ...(await chrome.storage.session.get({ [MAP_KEY]: {} }))[MAP_KEY] }; }
async function remember(tab: chrome.tabs.Tab): Promise<void> { if (tab.id === undefined) return; const m = await map(); const previous = m[tab.id]; const url = tab.url || tab.pendingUrl || previous?.url; if (url) m[tab.id] = { url, title: tab.title || previous?.title || url }; await chrome.storage.session.set({ [MAP_KEY]: m }); }
async function seed(): Promise<void> { for (const tab of await chrome.tabs.query({})) await remember(tab); }
export function initTabNotesBackground(): void {
  chrome.tabs.onCreated.addListener(tab => schedule(() => remember(tab)));
  chrome.tabs.onUpdated.addListener((_id, _change, tab) => schedule(() => remember(tab)));
  chrome.tabs.onReplaced.addListener((added, removed) => schedule(async () => { const m = await map(); if (m[removed]) { m[added] = m[removed]; delete m[removed]; await chrome.storage.session.set({ [MAP_KEY]: m }); } }));
  chrome.tabs.onRemoved.addListener(id => schedule(async () => { const m = await map(); const entry = m[id]; delete m[id]; await chrome.storage.session.set({ [MAP_KEY]: m }); if (entry && await isModuleEnabled(TAB_NOTES_ID) && (await chrome.storage.local.get({ [TRANSFER_KEY]: false }))[TRANSFER_KEY]) await transferTabNote(entry.url, entry.title, createTabNotesRepo(backgroundDb), createNotesRepo(backgroundDb)); }));
  chrome.runtime.onStartup.addListener(() => schedule(seed)); chrome.runtime.onInstalled.addListener(() => schedule(seed));
  schedule(seed);
}
