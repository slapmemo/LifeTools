import { applyTheme } from '../../core/theme';
import { confirmSecondClick, createKebabMenu } from '../../panel/ui';
import { groupWindowBySite } from '../life-browser/browser';
import { buildViewModel, COLORS, selectRange } from './logic';

void applyTheme();
const el = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const windowsEl = el<HTMLElement>('#windows'), search = el<HTMLInputElement>('#search'), message = el<HTMLElement>('#message');
let tabs: chrome.tabs.Tab[] = [], groups: chrome.tabGroups.TabGroup[] = [], currentWindowId: number | undefined;
let selected = new Set<number>(), anchor: number | undefined, anchorWindow: number | undefined, color: chrome.tabGroups.ColorEnum = 'grey';
let timer: ReturnType<typeof setTimeout> | undefined;
const report = (error: unknown): void => { message.textContent = error instanceof Error ? error.message : 'İşlem başarısız oldu.'; };
const run = (fn: () => Promise<void>): void => { void fn().catch(report); };
const button = (label: string, action: () => void): HTMLButtonElement => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; };
const dot = (value: string): HTMLElement => { const d = document.createElement('span'); d.className = 'dot'; d.style.setProperty('--group-color', colorValue(value)); return d; };
function colorValue(value: string): string { return ({ grey:'#9aa0a6', blue:'#1a73e8', red:'#d93025', yellow:'#f9ab00', green:'#188038', pink:'#d01884', purple:'#a142f4', cyan:'#12a8b5', orange:'#fa903e' } as Record<string,string>)[value] || '#9aa0a6'; }
function swatches(value: string, onChange: (c: chrome.tabGroups.ColorEnum) => void): HTMLElement {
  const box = document.createElement('div'); box.className = 'color-picker';
  for (const item of COLORS) { const b = button('', () => onChange(item.color)); b.className = 'swatch'; b.title = item.label; b.setAttribute('aria-label', item.label); b.setAttribute('aria-pressed', String(item.color === value)); b.style.setProperty('--group-color', colorValue(item.color)); box.append(b); } return box;
}
async function load(): Promise<void> {
  const [wins, allTabs, allGroups, own, current] = await Promise.all([chrome.windows.getAll({windowTypes:['normal']}), chrome.tabs.query({}), chrome.tabGroups.query({}), chrome.tabs.getCurrent(), chrome.windows.getCurrent()]);
  const ids = new Set(wins.map(w => w.id)); tabs = allTabs.filter(t => ids.has(t.windowId) && t.id !== own?.id); groups = allGroups.filter(g => ids.has(g.windowId)); currentWindowId = current.id;
  const existing = new Set(tabs.map(t => t.id)); selected = new Set([...selected].filter(id => existing.has(id))); render();
}
function render(): void {
  const model = buildViewModel(tabs, groups, chrome.runtime.getURL('tabs.html'), currentWindowId);
  const query = search.value.trim().toLocaleLowerCase('tr-TR');
  const matches = (t: chrome.tabs.Tab): boolean => `${t.title || ''} ${t.url || t.pendingUrl || ''}`.toLocaleLowerCase('tr-TR').includes(query);
  el('#counts').textContent = `${model.reduce((n,w) => n + w.tabs.length, 0)} sekme · ${model.reduce((n,w) => n + w.groups.length, 0)} grup`;
  el('#selection').hidden = !selected.size; el('#selected-count').textContent = `${selected.size} sekme seçildi`;
  const groupList = el('#groups'); groupList.replaceChildren();
  for (const g of groups) { const b = button(g.title || 'Adsız grup', () => run(async () => { await moveSelected(g.windowId); await chrome.tabs.group({groupId:g.id, tabIds:[...selected] as [number,...number[]]}); selected.clear(); await load(); })); b.prepend(dot(g.color)); groupList.append(b); }
  windowsEl.replaceChildren();
  model.forEach((win, index) => {
    const section = document.createElement('section'); section.className = 'window';
    const heading = document.createElement('div'); heading.className = 'window-title'; const h = document.createElement('h2'); h.textContent = `Pencere ${index + 1}`;
    heading.append(h, button('Tümünü seç', () => { for (const t of win.tabs.filter(matches)) if (t.id !== undefined) selected.add(t.id); render(); })); section.append(heading);
    const row = (tab: chrome.tabs.Tab): HTMLElement => {
      const li = document.createElement('li'); li.className = 'row'; const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(tab.id!); check.setAttribute('aria-label', `${tab.title || 'Sekme'} seç`);
      check.addEventListener('click', e => { const ids = win.tabs.filter(matches).map(t => t.id!).filter(id => id !== undefined); selected = selectRange(ids, (e as MouseEvent).shiftKey && anchorWindow === win.id ? anchor : undefined, tab.id!, selected, check.checked); anchor = tab.id; anchorWindow = win.id; render(); });
      let fav: HTMLElement = document.createElement('span'); fav.className = 'favicon'; fav.textContent = '🌐';
      if (tab.favIconUrl && /^(https?:|data:)/i.test(tab.favIconUrl)) { const img = document.createElement('img'); img.src = tab.favIconUrl; img.alt = ''; img.addEventListener('error', () => img.replaceWith(fav)); li.append(check, img); } else li.append(check, fav);
      const info = document.createElement('div'); info.className = 'tab-info'; const title = button(tab.title || tab.url || 'Yeni sekme', () => run(async () => { await chrome.tabs.update(tab.id!, {active:true}); await chrome.windows.update(tab.windowId, {focused:true}); })); title.className = 'ghost tab-title';
      const host = document.createElement('div'); host.className = 'host muted'; try { host.textContent = new URL(tab.url || tab.pendingUrl || '').host; } catch { host.textContent = tab.url || ''; }
      info.append(title, host); const flags = document.createElement('span'); flags.textContent = `${tab.pinned ? '📌' : ''}${tab.audible ? ' 🔊' : ''}`; li.append(info,flags); return li;
    };
    for (const card of win.groups) {
      const visible = card.tabs.filter(matches); if (!visible.length) continue;
      const box = document.createElement('div'); box.className = 'card group'; const header = document.createElement('div'); header.className = 'group-header'; header.append(dot(card.group.color));
      const name = button(card.group.title || 'Adsız grup', () => { const input = document.createElement('input'); input.value = card.group.title || ''; input.setAttribute('aria-label','Grup adı'); name.replaceWith(input); input.focus(); let saved = false; const save = (): void => { if (saved) return; saved = true; run(async () => { await chrome.tabGroups.update(card.group.id, {title:input.value}); await load(); }); }; input.addEventListener('blur', save); input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }); }); name.className = 'ghost name'; header.append(name);
      const picker = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Renk'; const pop = swatches(card.group.color, c => run(async () => { await chrome.tabGroups.update(card.group.id,{color:c}); await load(); })); pop.classList.add('popover','card'); picker.append(summary,pop); header.append(picker);
      header.append(button(card.group.collapsed ? 'Genişlet' : 'Daralt', () => run(async () => { await chrome.tabGroups.update(card.group.id,{collapsed:!card.group.collapsed}); await load(); })));
      const ids = card.tabs.map(t => t.id!).filter(id => id !== undefined); header.append(createKebabMenu([{label:'Grubu çöz',onSelect:() => run(async () => { await chrome.tabs.ungroup(ids); await load(); })},{label:'Grubu kapat',danger:true,confirm:true,onSelect:() => run(async () => { await chrome.tabs.remove(ids); await load(); })}], 'Grup işlemleri'));
      box.append(header); const list = document.createElement('ul'); list.className = 'rows'; if (!card.group.collapsed || query) visible.forEach(t => list.append(row(t))); box.append(list); section.append(box);
    }
    const ungrouped = win.ungrouped.filter(matches); if (ungrouped.length) { const box = document.createElement('div'); box.className = 'card group'; const title = document.createElement('div'); title.className = 'group-header'; title.textContent = 'Grupsuz sekmeler'; const list = document.createElement('ul'); list.className = 'rows'; ungrouped.forEach(t => list.append(row(t))); box.append(title,list); section.append(box); } windowsEl.append(section);
  });
}
async function moveSelected(windowId: number): Promise<void> { for (const id of selected) { const tab = tabs.find(t => t.id === id); if (tab && tab.windowId !== windowId) await chrome.tabs.move(id, {windowId,index:-1}); } }
el('#new-group').addEventListener('click', () => { el('#new-form').hidden = !el('#new-form').hidden; });
function renderSwatches(): void { const s = el('#swatches'); s.replaceChildren(swatches(color, c => { color = c; renderSwatches(); })); } renderSwatches();
el<HTMLFormElement>('#new-form').addEventListener('submit', e => { e.preventDefault(); run(async () => { const first = tabs.find(t => t.id === [...selected][0]); if (!first || !selected.size) return; await moveSelected(first.windowId); const id = await chrome.tabs.group({tabIds:[...selected] as [number,...number[]],createProperties:{windowId:first.windowId}}); await chrome.tabGroups.update(id,{title:el<HTMLInputElement>('#group-name').value,color}); selected.clear(); el('#new-form').hidden = true; await load(); }); });
el('#ungroup').addEventListener('click', () => run(async () => { await chrome.tabs.ungroup([...selected]); selected.clear(); await load(); }));
confirmSecondClick(el<HTMLButtonElement>('#close'), () => run(async () => { await chrome.tabs.remove([...selected]); selected.clear(); await load(); }));
el('#clear').addEventListener('click', () => { selected.clear(); render(); });
el('#site').addEventListener('click', () => run(async () => { let count = 0; for (const id of new Set(tabs.map(t => t.windowId))) count += await groupWindowBySite(id); message.textContent = `${count} grup oluşturuldu`; await load(); }));
search.addEventListener('input', render); document.addEventListener('keydown', e => { if (e.key === 'Escape') { selected.clear(); render(); } });
const schedule = (): void => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load().catch(report); },150); };
chrome.tabs.onCreated.addListener(schedule); chrome.tabs.onRemoved.addListener(schedule); chrome.tabs.onUpdated.addListener(schedule); chrome.tabs.onMoved.addListener(schedule); chrome.tabs.onAttached.addListener(schedule); chrome.tabs.onDetached.addListener(schedule);
chrome.tabGroups.onCreated.addListener(schedule); chrome.tabGroups.onUpdated.addListener(schedule); chrome.tabGroups.onRemoved.addListener(schedule); chrome.tabGroups.onMoved.addListener(schedule);
void load().catch(report);
