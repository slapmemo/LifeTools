import { applyTheme } from '../../core/theme';
import { popupDb } from '../../db/client';
import { confirmSecondClick, createKebabMenu } from '../../panel/ui';
import { groupWindowBySite, moveTabsToSession, openSession } from '../life-browser/browser';
import { AUTO_PREFIX, createSessionsRepo } from '../life-browser/repo';
import { buildViewModel, COLORS, selectRange } from './logic';
import { PIN_MANAGER_KEY } from './settings';
import { pills, ws, type WorkspaceState } from './workspace-ui';

void applyTheme();
const el = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const windowsEl = el<HTMLElement>('#windows'), search = el<HTMLInputElement>('#search'), message = el<HTMLElement>('#message');
let tabs: chrome.tabs.Tab[] = [], groups: chrome.tabGroups.TabGroup[] = [], currentWindowId: number | undefined;
let selected = new Set<number>(), anchor: number | undefined, anchorWindow: number | undefined, color: chrome.tabGroups.ColorEnum = 'grey';
let timer: ReturnType<typeof setTimeout> | undefined;
let workspaceState: WorkspaceState | undefined;
const repo = createSessionsRepo(popupDb);
let savedVersion = '', savedSequence = 0;
let undoTimer: ReturnType<typeof setTimeout> | undefined;
const report = (error: unknown): void => { message.textContent = error instanceof Error ? error.message : 'İşlem başarısız oldu.'; };
const pinSetting = el<HTMLInputElement>('#pin-manager');
void chrome.storage.local.get({ [PIN_MANAGER_KEY]: true }).then(data => { pinSetting.checked = data[PIN_MANAGER_KEY] === true; });
pinSetting.addEventListener('change', () => { void chrome.storage.local.set({ [PIN_MANAGER_KEY]: pinSetting.checked }); });
const run = (fn: () => Promise<void>): void => { void fn().catch(report); };
const button = (label: string, action: () => void): HTMLButtonElement => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; };
const dot = (value: string): HTMLElement => { const d = document.createElement('span'); d.className = 'dot'; d.style.setProperty('--group-color', colorValue(value)); return d; };
function colorValue(value: string): string { return ({ grey:'#9aa0a6', blue:'#1a73e8', red:'#d93025', yellow:'#f9ab00', green:'#188038', pink:'#d01884', purple:'#a142f4', cyan:'#12a8b5', orange:'#fa903e' } as Record<string,string>)[value] || '#9aa0a6'; }
function swatches(value: string, onChange: (c: chrome.tabGroups.ColorEnum) => void): HTMLElement {
  const box = document.createElement('div'); box.className = 'color-picker';
  for (const item of COLORS) { const b = button('', () => onChange(item.color)); b.className = 'swatch'; b.title = item.label; b.setAttribute('aria-label', item.label); b.setAttribute('aria-pressed', String(item.color === value)); b.style.setProperty('--group-color', colorValue(item.color)); box.append(b); } return box;
}
async function load(): Promise<void> {
  const [wins, allTabs, allGroups, own, current, state] = await Promise.all([chrome.windows.getAll({windowTypes:['normal']}), chrome.tabs.query({}), chrome.tabGroups.query({}), chrome.tabs.getCurrent(), chrome.windows.getCurrent(), ws<WorkspaceState>({type:'ws:list'})]);
  workspaceState = state;
  const ids = new Set(wins.map(w => w.id)); tabs = allTabs.filter(t => ids.has(t.windowId) && t.id !== own?.id); groups = allGroups.filter(g => ids.has(g.windowId)); currentWindowId = current.id;
  const existing = new Set(tabs.map(t => t.id)); selected = new Set([...selected].filter(id => existing.has(id))); render();
}
function render(): void {
  renderWorkspaces();
  const workspaceMode = workspaceState?.mode === 'workspaces';
  const model = buildViewModel(workspaceMode ? tabs.filter(t => t.windowId === currentWindowId) : tabs, workspaceMode ? groups.filter(g => g.windowId === currentWindowId) : groups, chrome.runtime.getURL('tabs.html'), currentWindowId);
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
    heading.append(h, button('Tümünü seç', () => { for (const t of win.tabs.filter(matches)) if (t.id !== undefined) selected.add(t.id); render(); }), button('Penceredekileri kaydet ve kapat', () => run(() => saveAndClose(win.tabs)))); section.append(heading);
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
      if (!workspaceMode) header.append(button(card.group.collapsed ? 'Genişlet' : 'Daralt', () => run(async () => { await chrome.tabGroups.update(card.group.id,{collapsed:!card.group.collapsed}); await load(); })));
      const ids = card.tabs.map(t => t.id!).filter(id => id !== undefined); if (!workspaceMode) header.append(createKebabMenu([{label:'Grubu kaydet ve kapat',onSelect:() => run(() => saveAndClose(card.tabs, card.group.title?.trim() || 'Grup'))},{label:'Grubu çöz',onSelect:() => run(async () => { await chrome.tabs.ungroup(ids); await load(); })},{label:'Grubu kapat',danger:true,confirm:true,onSelect:() => run(async () => { await chrome.tabs.remove(ids); await load(); })}], 'Grup işlemleri'));
      box.append(header); const list = document.createElement('ul'); list.className = 'rows'; if (workspaceMode || !card.group.collapsed || query) visible.forEach(t => list.append(row(t))); box.append(list); section.append(box);
    }
    const ungrouped = win.ungrouped.filter(matches); if (ungrouped.length) { const box = document.createElement('div'); box.className = 'card group'; const title = document.createElement('div'); title.className = 'group-header'; title.textContent = 'Grupsuz sekmeler'; const list = document.createElement('ul'); list.className = 'rows'; ungrouped.forEach(t => list.append(row(t))); box.append(title,list); section.append(box); } windowsEl.append(section);
  });
}
async function switchWorkspace(id: string): Promise<void> { if (currentWindowId === undefined) return; message.textContent = 'Geçiliyor…'; await ws({type:'ws:switch', windowId:currentWindowId, id}); message.textContent = 'Çalışma alanına geçildi.'; selected.clear(); await load(); }
function renderWorkspaces(): void {
  const state = workspaceState; if (!state) return;
  const enabled = state.mode === 'workspaces', active = currentWindowId === undefined ? undefined : state.activeByWindow[currentWindowId];
  for (const id of ['site','new-group','group-select','ungroup']) el(id === 'site' ? '#site' : `#${id}`).hidden = enabled;
  el('#workspace-select').hidden = !enabled; if (enabled) el('#new-form').hidden = true;
  document.querySelectorAll<HTMLButtonElement>('#mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  const bar = el('#workspace-bar'), saved = el('#workspace-saved'), targets = el('#workspace-targets'); bar.replaceChildren(); saved.replaceChildren(); targets.replaceChildren();
  el('#convert').hidden = !enabled || !groups.some(g => g.windowId === currentWindowId);
  if (!enabled) return;
  for (const w of pills(state.workspaces, active)) {
    const wrap = document.createElement('div'); wrap.className = 'workspace-pill';
    const select = button(`${w.name} · ${w.count}`, () => run(() => switchWorkspace(w.id))); select.prepend(dot(w.color)); select.setAttribute('aria-pressed', String(w.active)); wrap.append(select);
    const menu = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = '⋯'; summary.setAttribute('aria-label', `${w.name} işlemleri`); const panel = document.createElement('div'); panel.className = 'popover card';
    panel.append(button('Yeniden adlandır', () => { const input = document.createElement('input'); input.value = w.name; input.setAttribute('aria-label','Çalışma alanı adı'); panel.replaceChildren(input); input.focus(); let done = false; const save = (): void => { if (done) return; done = true; run(async () => { await ws({type:'ws:update', id:w.id, name:input.value}); await load(); }); }; input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }); input.addEventListener('blur', save, {once:true}); }));
    panel.append(button('Renk', () => { panel.replaceChildren(swatches(w.color, c => run(async () => { await ws({type:'ws:update',id:w.id,color:c}); await load(); }))); }));
    panel.append(button('Sil', () => { const label = document.createElement('label'); label.textContent = 'Sekmeleri şuraya taşı:'; const target = document.createElement('select'); const none = document.createElement('option'); none.value = ''; none.textContent = 'Yok — kayıtlı sekmeleri sil'; target.append(none); for (const other of state.workspaces.filter(x => x.id !== w.id)) { const option = document.createElement('option'); option.value = other.id; option.textContent = other.name; target.append(option); } label.append(target); const del = button('Sil', () => {}); confirmSecondClick(del, () => run(async () => { await ws({type:'ws:delete',id:w.id,...(target.value ? {moveTo:target.value} : {})}); await load(); })); panel.replaceChildren(label,del); })); menu.append(summary,panel); wrap.append(menu); bar.append(wrap);
    if (!w.active) { targets.append(button(w.name, () => run(async () => { await ws({type:'ws:move-tabs',tabIds:[...selected],id:w.id}); selected.clear(); await load(); }))); const details = document.createElement('details'); const heading = document.createElement('summary'); heading.textContent = `${w.name} · ${w.count} sekme`; details.append(heading); const list = document.createElement('ul'); list.className = 'rows'; for (const tab of w.tabs) { const li = document.createElement('li'); li.className = 'row'; const info = document.createElement('div'); const title = button(tab.title || tab.url, () => run(() => switchWorkspace(w.id))); title.className = 'ghost tab-title'; const host = document.createElement('div'); host.className = 'host muted'; try { host.textContent = new URL(tab.url).host; } catch { host.textContent = tab.url; } info.append(title,host); li.append(info); list.append(li); } details.append(list); saved.append(details); }
  }
  bar.append(button('＋ Yeni alan', () => { const form = document.createElement('form'); form.className = 'workspace-form'; const name = document.createElement('input'); name.placeholder = 'Alan adı'; name.setAttribute('aria-label','Alan adı'); let chosen: chrome.tabGroups.ColorEnum = 'grey'; const colors = document.createElement('div'); const update = (): void => colors.replaceChildren(swatches(chosen, c => { chosen = c; update(); })); update(); const submit = button('Oluştur', () => {}); submit.type = 'submit'; form.append(name,colors,submit); form.addEventListener('submit', e => { e.preventDefault(); run(async () => { const result = await ws<{id:string}>({type:'ws:create',name:name.value,color:chosen}); await switchWorkspace(result.id); }); }); bar.append(form); name.focus(); }));
}
document.querySelectorAll<HTMLButtonElement>('#mode button').forEach(b => b.addEventListener('click', () => run(async () => { await ws({type:'ws:set-mode',mode:b.dataset.mode}); await load(); })));
el('#convert button').addEventListener('click', () => run(async () => { await ws({type:'ws:convert-groups',windowId:currentWindowId}); message.textContent = 'Gruplar dönüştürüldü.'; await load(); }));
chrome.storage.onChanged.addListener((changes, area) => { if ((area === 'local' && (changes.workspaces || changes.workspaceMode)) || (area === 'session' && changes.windowWorkspace)) schedule(); });
async function saveAndClose(candidates: chrome.tabs.Tab[], name?: string): Promise<void> {
  const own = await chrome.tabs.getCurrent();
  const managerUrl = chrome.runtime.getURL('tabs.html');
  const eligible = candidates.filter(t => t.id !== undefined && t.id !== own?.id && !t.pinned && !!(t.url || t.pendingUrl) && (t.url || t.pendingUrl || '').split('?')[0] !== managerUrl)
    .map(t => ({ ...t, url: t.url || t.pendingUrl }));
  if (!eligible.length) throw new Error('Kaydedilecek sekme yok.');
  const date = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  const defaultName = `Kaydedilen — ${two(date.getDate())}.${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}`;
  const id = await moveTabsToSession(repo, name || defaultName, eligible);
  selected.clear();
  if (undoTimer) clearTimeout(undoTimer);
  message.replaceChildren(document.createTextNode(`${eligible.length} sekme kaydedildi `));
  const undo = button('Geri al', () => run(async () => {
    undo.disabled = true;
    try { await openSession(await repo.tabs(id)); await repo.delete(id); message.textContent = 'Sekmeler geri açıldı.'; await refreshSaved(true); }
    catch (error) { undo.disabled = false; throw error; }
  }));
  message.append(undo);
  undoTimer = setTimeout(() => { undo.remove(); }, 10000);
  await Promise.all([load(), refreshSaved(true)]);
}

async function refreshSaved(force = false): Promise<void> {
  const sequence = ++savedSequence;
  const sessions = await repo.list();
  const version = JSON.stringify(sessions);
  if (sequence !== savedSequence || (!force && version === savedVersion)) return;
  const entries = await Promise.all(sessions.map(async session => ({ session, tabs: await repo.tabs(session.id) })));
  if (sequence !== savedSequence) return;
  savedVersion = version;
  const container = el('#saved');
  container.replaceChildren();
  for (const { session, tabs: savedTabs } of entries) {
    const card = document.createElement('article'); card.className = 'card saved-card';
    const head = document.createElement('div'); head.className = 'saved-header';
    const name = button(session.name, () => {
      const input = document.createElement('input'); input.value = session.name; input.maxLength = 100; input.setAttribute('aria-label', 'Oturum adı'); name.replaceWith(input); input.focus(); input.select();
      let done = false;
      const save = (): void => { if (done) return; done = true; run(async () => { try { await repo.rename(session.id, input.value); } finally { await refreshSaved(true); } }); };
      input.addEventListener('blur', save); input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { done = true; void refreshSaved(true).catch(report); } });
    }); name.className = 'ghost name';
    const meta = document.createElement('span'); meta.className = 'muted'; meta.textContent = `${new Date(session.created_at).toLocaleString('tr-TR')} · ${session.tab_count} sekme`;
    head.append(name, meta);
    if (session.name.startsWith(AUTO_PREFIX)) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = 'otomatik'; head.append(chip); }
    const open = (remove: boolean): void => run(async () => { await openSession(await repo.tabs(session.id)); if (remove) await repo.delete(session.id); await refreshSaved(true); });
    head.append(button('Hepsini aç', () => open(false)), button('Aç ve listeden sil', () => open(true)));
    const del = button('Sil', () => {}); del.className = 'danger'; confirmSecondClick(del, () => run(async () => { await repo.delete(session.id); await refreshSaved(true); })); head.append(del);
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Sekmeler'; details.append(summary);
    const list = document.createElement('ul'); list.className = 'rows';
    for (const tab of savedTabs) {
      const row = document.createElement('li'); row.className = 'row';
      const link = button(tab.title || tab.url, () => run(async () => { await chrome.tabs.create({ windowId: currentWindowId, url: tab.url }); })); link.className = 'ghost tab-title';
      const remove = button('×', () => run(async () => { await repo.removeTab(session.id, tab.id); await refreshSaved(true); })); remove.setAttribute('aria-label', `${tab.title || tab.url} kaydını kaldır`);
      row.append(link, remove); list.append(row);
    }
    details.append(list); card.append(head, details); container.append(card);
  }
  if (!sessions.length) container.textContent = 'Henüz kaydedilmiş oturum yok.';
}
async function moveSelected(windowId: number): Promise<void> { for (const id of selected) { const tab = tabs.find(t => t.id === id); if (tab && tab.windowId !== windowId) await chrome.tabs.move(id, {windowId,index:-1}); } }
el('#new-group').addEventListener('click', () => { el('#new-form').hidden = !el('#new-form').hidden; });
function renderSwatches(): void { const s = el('#swatches'); s.replaceChildren(swatches(color, c => { color = c; renderSwatches(); })); } renderSwatches();
el<HTMLFormElement>('#new-form').addEventListener('submit', e => { e.preventDefault(); run(async () => { const first = tabs.find(t => t.id === [...selected][0]); if (!first || !selected.size) return; await moveSelected(first.windowId); const id = await chrome.tabs.group({tabIds:[...selected] as [number,...number[]],createProperties:{windowId:first.windowId}}); await chrome.tabGroups.update(id,{title:el<HTMLInputElement>('#group-name').value,color}); selected.clear(); el('#new-form').hidden = true; await load(); }); });
el('#ungroup').addEventListener('click', () => run(async () => { await chrome.tabs.ungroup([...selected]); selected.clear(); await load(); }));
el('#save-close').addEventListener('click', () => run(() => saveAndClose(tabs.filter(t => t.id !== undefined && selected.has(t.id)))));
confirmSecondClick(el<HTMLButtonElement>('#close'), () => run(async () => { await chrome.tabs.remove([...selected]); selected.clear(); await load(); }));
el('#clear').addEventListener('click', () => { selected.clear(); render(); });
el('#site').addEventListener('click', () => run(async () => { let count = 0; for (const id of new Set(tabs.map(t => t.windowId))) count += await groupWindowBySite(id); message.textContent = `${count} grup oluşturuldu`; await load(); }));
search.addEventListener('input', render); document.addEventListener('keydown', e => { if (e.key === 'Escape') { selected.clear(); render(); } });
const schedule = (): void => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void load().catch(report); },150); };
chrome.tabs.onCreated.addListener(schedule); chrome.tabs.onRemoved.addListener(schedule); chrome.tabs.onUpdated.addListener(schedule); chrome.tabs.onMoved.addListener(schedule); chrome.tabs.onAttached.addListener(schedule); chrome.tabs.onDetached.addListener(schedule);
chrome.tabGroups.onCreated.addListener(schedule); chrome.tabGroups.onUpdated.addListener(schedule); chrome.tabGroups.onRemoved.addListener(schedule); chrome.tabGroups.onMoved.addListener(schedule);
void load().catch(report);
void refreshSaved().catch(report);
window.addEventListener('focus', () => { void refreshSaved().catch(report); });
setInterval(() => { if (!document.hidden && !el('#saved').contains(document.activeElement)) void refreshSaved().catch(report); }, 3000);
