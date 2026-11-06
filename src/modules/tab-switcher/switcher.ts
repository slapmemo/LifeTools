import { applyTheme } from '../../core/theme';
void applyTheme();
import { popupDb } from '../../db/client';
import { isModuleEnabled } from '../../core/module-state';
import { normalizeUrl } from '../life-browser/tabs';
import { createTabLabelsRepo } from '../tab-labels/repo';
import { createTabNotesRepo } from '../tab-notes/repo';
import { cleanTitle, TITLE_RULES_KEY, type TitleRules } from '../title-cleaner/cleaner';
import { TITLE_CLEANER_ID } from '../title-cleaner';
import { filterTabs, type SearchTab } from './filter';
type Item = SearchTab & { tab: chrome.tabs.Tab; site: string };
const search = document.querySelector('#search') as HTMLInputElement, cards = document.querySelector('#cards') as HTMLElement, empty = document.querySelector('#empty') as HTMLElement;
let all: Item[] = [], visible: Item[] = [], selected = 0;
async function load(): Promise<void> {
 const [tabs, labels, notes, data, enabled] = await Promise.all([chrome.tabs.query({}), createTabLabelsRepo(popupDb).list(), createTabNotesRepo(popupDb).list(), chrome.storage.local.get({ [TITLE_RULES_KEY]: {} }), isModuleEnabled(TITLE_CLEANER_ID)]);
 const own = (await chrome.tabs.getCurrent())?.id;
 const lm = new Map(labels.map(x => [x.url,x.label])), nm = new Map(notes.map(x => [x.url,x.note]));
 all = tabs.filter(tab => tab.id !== own && tab.id !== undefined).map(tab => { const url = tab.url || tab.pendingUrl || ''; let site = url; try { site = new URL(url).hostname || url; } catch {} const title = tab.title || url || 'Yeni sekme'; return { tab, url, title: enabled ? cleanTitle(title,url,data[TITLE_RULES_KEY] as TitleRules) : title, site, label: lm.get(normalizeUrl(url)) || '', note: nm.get(normalizeUrl(url)) || '' }; }); render();
}
function render(): void { visible = filterTabs(all, search.value); selected = Math.min(selected, Math.max(0,visible.length - 1)); cards.replaceChildren(); empty.hidden = visible.length > 0; visible.forEach((item,i) => { const el = document.createElement('button'); el.className = 'card' + (i === selected ? ' selected' : ''); el.setAttribute('role','option'); el.setAttribute('aria-selected', String(i === selected)); if (item.tab.favIconUrl) { const img = document.createElement('img'); img.src = chrome.runtime.getURL('_favicon/') + '?pageUrl=' + encodeURIComponent(item.url) + '&size=32'; img.alt = ''; el.append(img); } const title = document.createElement('strong'); title.textContent = item.title; const site = document.createElement('p'); site.className = 'site'; site.textContent = item.site; el.append(title,site); if(item.label) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = item.label; el.append(chip); } const flags = document.createElement('span'); flags.textContent = `${item.note ? ' 📝' : ''}${item.tab.audible ? ' 🔊' : ''}${item.tab.pinned ? ' 📌' : ''}`; el.append(flags); el.addEventListener('click', () => { void activate(item); }); cards.append(el); }); }
async function activate(item: Item): Promise<void> { if(item.tab.id === undefined) return; await chrome.tabs.update(item.tab.id,{active:true}); await chrome.windows.update(item.tab.windowId,{focused:true}); window.close(); }
search.addEventListener('input', () => { selected=0; render(); });
document.addEventListener('keydown', event => { if (['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(event.key)) { event.preventDefault(); if (visible.length) selected = (selected + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length; render(); } else if(event.key === 'Enter' && visible[selected]) { event.preventDefault(); void activate(visible[selected]); } else if(event.key === 'Delete' && visible[selected]) { event.preventDefault(); const id = visible[selected].tab.id; if(id !== undefined) void chrome.tabs.remove(id).then(() => { all = all.filter(x => x.tab.id !== id); render(); }); } });
void load();
