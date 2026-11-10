import { applyTheme } from '../../core/theme';
import { extensionBaseUrl, isInternalTabUrl } from '../../core/internal-tab';
import { openTabManager } from '../tab-manager/open';
import { popupDb } from '../../db/client';
import { isModuleEnabled } from '../../core/module-state';
import { normalizeUrl, findDuplicates } from '../life-browser/tabs';
import { describeTabs, groupWindowBySite } from '../life-browser/browser';
import { createSessionsRepo } from '../life-browser/repo';
import { createTabLabelsRepo } from '../tab-labels/repo';
import { createTabNotesRepo } from '../tab-notes/repo';
import { cleanTitle, TITLE_RULES_KEY, type TitleRules } from '../title-cleaner/cleaner';
import { TITLE_CLEANER_ID } from '../title-cleaner';
import { DEFAULT_HOURS, LAST_ACTIVE_KEY, ZOMBIE_HOURS_KEY, normalizeHours, selectZombies } from '../zombie-tabs/zombie';
import { filterTabs, sortByMru, nextLabel, MRU_KEY, type SearchTab } from './filter';
void applyTheme();
type Item = SearchTab & { tab: chrome.tabs.Tab; site: string };
const search = document.querySelector('#search') as HTMLInputElement, cards = document.querySelector('#cards') as HTMLElement, empty = document.querySelector('#empty') as HTMLElement, message = document.querySelector('#message') as HTMLElement;
const button = (id: string): HTMLButtonElement => document.querySelector(`#${id}`) as HTMLButtonElement;
let all: Item[] = [], visible: Item[] = [], selected = 0, zombies = new URLSearchParams(location.search).has('zombies') && !new URLSearchParams(location.search).has('duplicates'), duplicates = new URLSearchParams(location.search).has('duplicates'), zombieIds = new Set<number>(), duplicateIds = new Set<number>(), editing: number | undefined;
let labelsEnabled = false, notesEnabled = false;
let pinned = false;
const toolbar = document.querySelector('#toolbar') as HTMLDetailsElement;
const chips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
async function load(): Promise<void> {
 const [tabs, labels, notes, data, session, titleEnabled, lifeEnabled, zombieEnabled, labelFlag, noteFlag] = await Promise.all([chrome.tabs.query({}), createTabLabelsRepo(popupDb).list(), createTabNotesRepo(popupDb).list(), chrome.storage.local.get({ [TITLE_RULES_KEY]: {}, [ZOMBIE_HOURS_KEY]: DEFAULT_HOURS }), chrome.storage.session.get({ [MRU_KEY]: [], [LAST_ACTIVE_KEY]: {} }), isModuleEnabled(TITLE_CLEANER_ID), isModuleEnabled('life-browser'), isModuleEnabled('zombie-tabs'), isModuleEnabled('tab-labels'), isModuleEnabled('tab-notes')]);
 labelsEnabled = labelFlag; notesEnabled = noteFlag;
 button('manager').hidden = !await isModuleEnabled('tab-manager');
 for (const id of ['group', 'duplicates', 'session']) button(id).hidden = !lifeEnabled;
 button('zombies').hidden = !zombieEnabled; if (!zombieEnabled) zombies = false;
 const own = (await chrome.tabs.getCurrent())?.id;
 zombieIds = new Set(selectZombies(tabs, session[LAST_ACTIVE_KEY] as Record<string, number>, Date.now(), normalizeHours(data[ZOMBIE_HOURS_KEY])).map(x => x.tab.id as number));
 const lm = new Map(labels.map(x => [x.url,x.label])), nm = new Map(notes.map(x => [x.url,x.note]));
 const mru = Array.isArray(session[MRU_KEY]) ? session[MRU_KEY] as number[] : [];
 all = sortByMru(tabs.filter(tab => tab.id !== own && tab.id !== undefined && !isInternalTabUrl(tab.url || tab.pendingUrl, extensionBaseUrl())), mru).map(tab => { const url = tab.url || tab.pendingUrl || ''; let site = url; try { site = new URL(url).hostname || url; } catch {} const title = tab.title || url || 'Yeni sekme'; return { tab, url, title: titleEnabled ? cleanTitle(title,url,data[TITLE_RULES_KEY] as TitleRules) : title, site, label: labelFlag ? lm.get(normalizeUrl(url)) || '' : '', note: noteFlag ? nm.get(normalizeUrl(url)) || '' : '' }; }); render();
}
function render(): void {
 button('zombies').setAttribute('aria-pressed', String(zombies));
 const urlCounts = new Map<string, number>();
 for (const item of all) { const url = normalizeUrl(item.url); if (url) urlCounts.set(url, (urlCounts.get(url) || 0) + 1); }
 duplicateIds = new Set(all.filter(item => (urlCounts.get(normalizeUrl(item.url)) || 0) > 1).map(item => item.tab.id as number));
 const counts: Record<string, number> = { all: all.length, pinned: all.filter(item => item.tab.pinned).length, duplicates: duplicateIds.size, zombies: all.filter(item => zombieIds.has(item.tab.id as number)).length };
 const active = zombies ? 'zombies' : duplicates ? 'duplicates' : pinned ? 'pinned' : 'all';
 const names: Record<string, string> = { all: 'Tümü', pinned: 'Sabit', duplicates: 'Kopyalar', zombies: 'Zombiler' };
 for (const chip of chips) { const key = chip.dataset.filter as string; chip.textContent = `${names[key]} · ${counts[key]}`; chip.setAttribute('aria-pressed', String(key === active)); }
 visible = filterTabs(all.filter(item => (!zombies || zombieIds.has(item.tab.id as number)) && (!duplicates || duplicateIds.has(item.tab.id as number)) && (!pinned || item.tab.pinned)), search.value); selected = Math.min(selected, Math.max(0,visible.length - 1)); cards.replaceChildren(); empty.hidden = visible.length > 0;
 visible.forEach((item,i) => { const el = document.createElement('div'); el.className = 'card' + (i === selected ? ' selected' : ''); el.tabIndex = 0; el.setAttribute('role','option'); el.setAttribute('aria-selected', String(i === selected));
 const favicon = document.createElement('div'); favicon.className = 'favicon'; const letter = item.title.trim().charAt(0).toLocaleUpperCase('tr-TR') || 'S'; favicon.textContent = letter;
 if (item.tab.favIconUrl) { const img = document.createElement('img'); img.src = chrome.runtime.getURL('_favicon/') + '?pageUrl=' + encodeURIComponent(item.url) + '&size=32'; img.alt = ''; img.addEventListener('error', () => { favicon.textContent = letter; }); favicon.replaceChildren(img); } el.append(favicon);
 const content = document.createElement('div'); content.className = 'card-content'; const line = document.createElement('div'); line.className = 'title-line'; const title = document.createElement('span'); title.className = 'title'; title.textContent = item.title; line.append(title);
 for (const value of [item.tab.pinned ? 'Sabit' : '', item.note ? 'Not var' : '', zombieIds.has(item.tab.id as number) ? 'Zombi' : '', item.label, item.tab.audible ? '🔊' : '']) { if (value) { const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = value; line.append(badge); } }
 const site = document.createElement('span'); site.className = 'site'; site.textContent = item.site; content.append(line, site); el.append(content);
 if (editing === item.tab.id) { const input = document.createElement('input'); input.className = 'note-input'; input.value = item.note; input.setAttribute('aria-label', 'Sekme notu'); input.addEventListener('click', e => e.stopPropagation()); input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { editing = undefined; render(); } else if (e.key === 'Enter') { e.preventDefault(); const value = input.value.trim(); void createTabNotesRepo(popupDb).set(item.url, value).then(() => { for (const x of all) if (normalizeUrl(x.url) === normalizeUrl(item.url)) x.note = value; editing = undefined; render(); }).catch(report); } }); content.append(input); queueMicrotask(() => input.focus()); }
 else if (item.note) { el.title = item.note; }
 if (i === selected) { const hint = document.createElement('span'); hint.className = 'enter-hint'; hint.textContent = 'Enter'; el.append(hint); }
 el.addEventListener('focus', () => { selected = i; }); el.addEventListener('click', () => { if (editing === undefined) void activate(item); }); cards.append(el); });
}
async function activate(item: Item): Promise<void> { if(item.tab.id === undefined) return; await chrome.tabs.update(item.tab.id,{active:true}); await chrome.windows.update(item.tab.windowId,{focused:true}); window.close(); }
function report(error: unknown): void { message.textContent = error instanceof Error ? error.message : 'İşlem başarısız oldu.'; }
async function rowAction(key: string, item: Item): Promise<void> {
 const id = item.tab.id; if (id === undefined) return;
 if (key === 'e' && labelsEnabled) { const value = nextLabel(item.label); await createTabLabelsRepo(popupDb).set(item.url,value); for (const x of all) if (normalizeUrl(x.url) === normalizeUrl(item.url)) x.label = value; }
 else if (key === 'n' && notesEnabled) editing = id;
 else if (key === 's') { const updated = await chrome.tabs.update(id,{ pinned: !item.tab.pinned }); item.tab = updated; }
 else if (key === 'Delete') { await chrome.tabs.remove(id); all = all.filter(x => x.tab.id !== id); }
 render();
}
search.addEventListener('input', () => { selected=0; render(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && toolbar.open) { toolbar.open = false; event.preventDefault(); return; } if (editing !== undefined || (event.target instanceof HTMLElement && event.target.closest('#toolbar, .filters'))) return; const item = visible[selected];
 if (['ArrowDown','ArrowRight','ArrowUp','ArrowLeft'].includes(event.key)) { event.preventDefault(); if (visible.length) selected = (selected + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length; render(); }
 else if(event.key === 'Enter' && item) { event.preventDefault(); void activate(item).catch(report); }
 else if (item && (event.target !== search || event.altKey)) { const key = event.key === 'Delete' ? 'Delete' : event.key.toLocaleLowerCase('tr-TR'); if (['e','n','s','Delete'].includes(key)) { event.preventDefault(); void rowAction(key,item).catch(report); } }
});
button('group').addEventListener('click', () => { void (async () => { const win = await chrome.windows.getCurrent(); if (win.id === undefined) return; const count = await groupWindowBySite(win.id); message.textContent = count ? `${count} grup oluşturuldu` : 'Aynı siteden 2+ sekme yok'; await load(); })().catch(report); });
button('duplicates').addEventListener('click', () => { void (async () => { const own = (await chrome.tabs.getCurrent())?.id; const tabs = (await chrome.tabs.query({currentWindow:true})).filter(t => t.id !== own); const ids = findDuplicates(tabs).flatMap(x => x.close); if (ids.length) await chrome.tabs.remove(ids); message.textContent = `${ids.length} kopya kapatıldı`; await load(); })().catch(report); });
button('session').addEventListener('click', () => { void (async () => { const own = (await chrome.tabs.getCurrent())?.id; const tabs = (await chrome.tabs.query({currentWindow:true})).filter(t => t.id !== own); const name = new Date().toLocaleString('tr-TR'); await createSessionsRepo(popupDb).save(name, await describeTabs(tabs)); message.textContent = `Oturum kaydedildi: ${name}`; })().catch(report); });
button('zombies').addEventListener('click', () => { zombies = !zombies; duplicates = false; pinned = false; button('zombies').setAttribute('aria-pressed', String(zombies)); selected = 0; void load().catch(report); });
for (const chip of chips) chip.addEventListener('click', () => { const filter = chip.dataset.filter; if (filter === 'zombies') { button('zombies').click(); return; } zombies = false; pinned = filter === 'pinned'; duplicates = filter === 'duplicates'; selected = 0; render(); });
document.addEventListener('click', event => { if (toolbar.open && event.target instanceof Node && !toolbar.contains(event.target)) toolbar.open = false; });
button('manager').addEventListener('click', () => { void openTabManager().catch(report); });
void load().catch(report);
