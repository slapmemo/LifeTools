import { applyTheme } from '../../core/theme';
import { popupDb } from '../../db/client';
import { confirmSecondClick, createKebabMenu } from '../../panel/ui';
import { closeWindowSafely, describeTabs, groupWindowBySite, moveTabsToSession, openSession } from '../life-browser/browser';
import { createSessionsRepo, type Session, type SessionTab } from '../life-browser/repo';
import { AUTO_SAVE_KEY } from '../life-browser/settings';
import { findDuplicates } from '../life-browser/tabs';
import { suppressAutoSaveForWindow } from '../life-browser/background';
import { exportPlain, exportMarkdown, resolveShortcutTarget, sortSavedGroups, sortSavedTabs, clusterBySite, orderClusters, type SavedSort, buildViewModel, dropAction, dragThresholdExceeded, insertionPosition, autoScrollSpeed, type DragSource, type DropTarget, COLORS, filterSavedGroup, groupTargetLabels, HIDDEN_PREFIX, hiddenGroupCollapsed, hiddenOpenTabs, hiddenTabModel, matchesQuery, newGroupTitle, partitionSaveable, savedCardModel, savedStoredName, selectRange, type SavedCardModel } from './logic';
import { isInternalTabUrl, extensionBaseUrl } from '../../core/internal-tab';
import { PIN_MANAGER_KEY } from './settings';

void applyTheme();
const el = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const windowsEl = el<HTMLElement>('#windows'), search = el<HTMLInputElement>('#search'), message = el<HTMLElement>('#message');
const groupSelect = el<HTMLDetailsElement>('#group-select');
const windowSaveName = el<HTMLInputElement>('#window-save-name');
const autoSaveWindow = el<HTMLInputElement>('#auto-save-window');
let tabs: chrome.tabs.Tab[] = [], groups: chrome.tabGroups.TabGroup[] = [], currentWindowId: number | undefined;
let selected = new Set<number>(), anchor: number | undefined, anchorWindow: number | undefined, color: chrome.tabGroups.ColorEnum = 'grey';
let timer: ReturnType<typeof setTimeout> | undefined;
const baseRepo = createSessionsRepo(popupDb);
const bumpSavedGroupsVersion = (): Promise<void> => chrome.storage.local.set({ savedGroupsVersion: Date.now() });
const repo: typeof baseRepo = new Proxy(baseRepo, {
  get(target, key: keyof typeof baseRepo) {
    const method = target[key];
    if (!['save', 'appendTabs', 'delete', 'rename', 'removeTab', 'removeTabs', 'removeHiddenTab', 'moveTab', 'reorderTabs', 'setTabNote'].includes(key)) return method;
    return async (...args: unknown[]) => {
      const result = await (method as (...values: unknown[]) => Promise<unknown>)(...args);
      await bumpSavedGroupsVersion();
      return result;
    };
  }
});
interface SavedEntry { session: Session; tabs: SessionTab[]; model: SavedCardModel }
let savedSort: SavedSort = 'date', savedOrder: number[] = [];
let savedSiteOrder: Record<string, string[]> = {};
const siteCollapseState = new Set<string>();
let savedVersion = '', savedSequence = 0, savedEntries: SavedEntry[] = [];
let savedLoaded = false;
let shortcutTarget: unknown;
const shortcutSelect = el<HTMLSelectElement>('#shortcut-target');
void chrome.storage.local.get('shortcutTargetGroup').then(data => { shortcutTarget = data.shortcutTargetGroup; renderSaved(); });
shortcutSelect.addEventListener('change', () => { shortcutTarget = shortcutSelect.value ? Number(shortcutSelect.value) : undefined; void chrome.storage.local.set({ shortcutTargetGroup: shortcutTarget ?? null }); });
el('#shortcut-settings').addEventListener('click', e => { e.preventDefault(); void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
let windowNumbers = new Map<number, number>();
const collapseState = new Map<number, boolean>();
let undoTimer: ReturnType<typeof setTimeout> | undefined;
const report = (error: unknown): void => { message.textContent = error instanceof Error ? error.message : 'İşlem başarısız oldu.'; };
const pinSetting = el<HTMLInputElement>('#pin-manager');
void chrome.storage.local.get({ [PIN_MANAGER_KEY]: true }).then(data => { pinSetting.checked = data[PIN_MANAGER_KEY] === true; });
pinSetting.addEventListener('change', () => { void chrome.storage.local.set({ [PIN_MANAGER_KEY]: pinSetting.checked }); });
void chrome.storage.local.get({ [AUTO_SAVE_KEY]: false }).then(data => { autoSaveWindow.checked = data[AUTO_SAVE_KEY] === true; });
autoSaveWindow.addEventListener('change', () => { void chrome.storage.local.set({ [AUTO_SAVE_KEY]: autoSaveWindow.checked }); });
const run = (fn: () => Promise<void>): void => { void fn().catch(report); };
const button = (label: string, action: () => void): HTMLButtonElement => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action); return b; };
const dot = (value: string): HTMLElement => { const d = document.createElement('span'); d.className = 'dot'; d.style.setProperty('--group-color', colorValue(value)); return d; };
const isBlocked = (url: string): boolean => isInternalTabUrl(url, extensionBaseUrl());
const skippedNote = (count: number): string => count ? ` (${count} sekme kaydedilemediği için açık bırakıldı)` : '';
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
/** Seçim çubuğu her zaman görünür; seçim yokken ipucu gösterilir ve eylemler devre dışı kalır. */
function renderSelectionBar(): void {
  const has = selected.size > 0;
  const count = el('#selected-count');
  count.textContent = has ? `${selected.size} sekme seçildi` : 'İşlem yapmak için sekmelerin solundaki kutucukları işaretleyin';
  count.classList.toggle('muted', !has);
  for (const id of ['#save-close', '#new-group', '#ungroup', '#close', '#clear']) el<HTMLButtonElement>(id).disabled = !has;
  groupSelect.classList.toggle('disabled', !has);
  groupSelect.querySelector('summary')?.setAttribute('aria-disabled', String(!has));
  if (!has) { groupSelect.open = false; el('#new-form').hidden = true; }
}
/** "Gruba ekle ▾": açık gruplar, ardından "Kayıtlı gruplar" başlığı altında gizli kayıtlı gruplar. */
function renderGroupTargets(): void {
  const groupList = el('#groups'); groupList.replaceChildren();
  for (const { group: g, label } of groupTargetLabels(groups, id => windowNumbers.get(id))) {
    const b = button(label, () => run(async () => { if (!selected.size) return; groupSelect.open = false; await moveSelected(g.windowId); await chrome.tabs.group({groupId:g.id, tabIds:[...selected] as [number,...number[]]}); selected.clear(); await load(); }));
    b.prepend(dot(g.color)); groupList.append(b);
  }
  const saved = savedEntries.filter(entry => entry.model.kind === 'hidden');
  if (saved.length) {
    const heading = document.createElement('div'); heading.className = 'popover-heading muted'; heading.textContent = 'Kayıtlı gruplar'; groupList.append(heading);
    for (const entry of saved) {
      const b = button(`${entry.model.name} · ${entry.model.count} sekme`, () => run(() => addSelectedToSaved(entry.session.id, entry.model.name)));
      b.title = 'Seçili sekmeleri bu kayıtlı gruba ekle ve kapat';
      b.prepend(dot(entry.model.color || 'grey')); groupList.append(b);
    }
  }
  if (!groupList.childElementCount) { const empty = document.createElement('span'); empty.className = 'muted'; empty.textContent = 'Henüz grup yok.'; groupList.append(empty); }
}
function render(): void {
  if (drag) { pendingRender = true; return; }
  const model = buildViewModel(tabs, groups, chrome.runtime.getURL('tabs.html'), currentWindowId);
  windowNumbers = new Map(model.map((win, index) => [win.id, index + 1]));
  const query = search.value.trim();
  const matches = (t: chrome.tabs.Tab): boolean => matchesQuery(`${t.title || ''} ${t.url || t.pendingUrl || ''}`, query);
  el('#counts').textContent = `${model.reduce((n,w) => n + w.tabs.length, 0)} sekme · ${model.reduce((n,w) => n + w.groups.length, 0)} grup`;
  renderSelectionBar();
  renderGroupTargets();
  windowsEl.replaceChildren();
  model.forEach((win, index) => {
    const section = document.createElement('section'); section.className = 'window';
    const heading = document.createElement('div'); heading.className = 'window-title'; const h = document.createElement('h2'); h.textContent = `Pencere ${index + 1}`;
    heading.append(h, button('Tümünü seç', () => { for (const t of win.tabs.filter(matches)) if (t.id !== undefined) selected.add(t.id); render(); }), button('Penceredekileri kaydet ve kapat', () => run(() => saveAndClose(win.tabs)))); section.append(heading);
    const row = (tab: chrome.tabs.Tab): HTMLElement => {
      const li = document.createElement('li'); li.className = 'row'; setupDrag(li, { kind: 'open', windowId: tab.windowId, groupId: tab.groupId }, tab); setupRowDrop(li, { kind: 'open', windowId: tab.windowId, groupId: tab.groupId, rowIndex: tab.index }); const check = document.createElement('input'); check.type = 'checkbox'; check.checked = selected.has(tab.id!); check.setAttribute('aria-label', `${tab.title || 'Sekme'} seç`);
      check.addEventListener('click', e => { const ids = win.tabs.filter(matches).map(t => t.id!).filter(id => id !== undefined); selected = selectRange(ids, (e as MouseEvent).shiftKey && anchorWindow === win.id ? anchor : undefined, tab.id!, selected, check.checked); anchor = tab.id; anchorWindow = win.id; render(); });
      let fav: HTMLElement = document.createElement('span'); fav.className = 'favicon'; fav.textContent = '🌐';
      if (tab.favIconUrl && /^(https?:|data:)/i.test(tab.favIconUrl)) { const img = document.createElement('img'); img.src = tab.favIconUrl; img.alt = ''; img.addEventListener('error', () => img.replaceWith(fav)); li.append(check, img); } else li.append(check, fav);
      const info = document.createElement('div'); info.className = 'tab-info'; const title = button(tab.title || tab.url || 'Yeni sekme', () => run(async () => { await chrome.tabs.update(tab.id!, {active:true}); await chrome.windows.update(tab.windowId, {focused:true}); })); title.className = 'ghost tab-title';
      const host = document.createElement('div'); host.className = 'host muted'; try { host.textContent = new URL(tab.url || tab.pendingUrl || '').host; } catch { host.textContent = tab.url || ''; }
      info.append(title, host); const flags = document.createElement('span'); flags.textContent = `${tab.pinned ? '📌' : ''}${tab.audible ? ' 🔊' : ''}`; li.append(info,flags); return li;
    };
    for (const card of win.groups) {
      const visible = card.tabs.filter(matches); if (!visible.length) continue;
      const box = document.createElement('div'); box.className = 'card group'; setupDrop(box, { kind: 'open', windowId: win.id, groupId: card.group.id }); const header = document.createElement('div'); header.className = 'group-header'; header.append(dot(card.group.color));
      const name = button(card.group.title || 'Adsız grup', () => { const input = document.createElement('input'); input.value = card.group.title || ''; input.setAttribute('aria-label','Grup adı'); name.replaceWith(input); input.focus(); let saved = false; const save = (): void => { if (saved) return; saved = true; run(async () => { await chrome.tabGroups.update(card.group.id, {title:input.value}); await load(); }); }; input.addEventListener('blur', save); input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }); }); name.className = 'ghost name'; header.append(name);
      const picker = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Renk'; const pop = swatches(card.group.color, c => run(async () => { await chrome.tabGroups.update(card.group.id,{color:c}); await load(); })); pop.classList.add('popover','card'); picker.append(summary,pop); header.append(picker);
      const hide = button('Kaydet ve kapat', () => run(() => hideGroup(card.tabs, card.group))); hide.title = 'Grubu Kayıtlı gruplar\'a taşı'; header.append(hide);
      header.append(button(card.group.collapsed ? 'Genişlet' : 'Daralt', () => run(async () => { await chrome.tabGroups.update(card.group.id,{collapsed:!card.group.collapsed}); await load(); })));
      const ids = card.tabs.map(t => t.id!).filter(id => id !== undefined); header.append(createKebabMenu([{label:'Grubu çöz',onSelect:() => run(async () => { await chrome.tabs.ungroup(ids); await load(); })},{label:'Grubu kapat',danger:true,confirm:true,onSelect:() => run(async () => { await chrome.tabs.remove(ids); await load(); })}], 'Grup işlemleri'));
      box.append(header); const list = document.createElement('ul'); list.className = 'rows'; if (!card.group.collapsed || query) visible.forEach(t => list.append(row(t))); box.append(list); section.append(box);
    }
    const ungrouped = win.ungrouped.filter(matches); { const box = document.createElement('div'); box.className = 'card group'; setupDrop(box, { kind: 'open', windowId: win.id, groupId: -1 }); const title = document.createElement('div'); title.className = 'group-header'; title.textContent = 'Grupsuz sekmeler'; const list = document.createElement('ul'); list.className = 'rows'; ungrouped.forEach(t => list.append(row(t))); box.append(title,list); section.append(box); } windowsEl.append(section);
  });
}
/** Mesaj alanında 10 sn süren "Geri al" düğmesi gösterir. */

type DragState = { source: DragSource; openTabs?: chrome.tabs.Tab[]; savedTab?: SessionTab; groupId?: number; site?: { key: string; tabs: SessionTab[] } };
type PointerDrag = { pointerId: number; row: HTMLElement; clone: HTMLElement; offsetX: number; offsetY: number; x: number; y: number; target?: DropTarget; targetElement?: HTMLElement; siteTarget?: { key: string; after: boolean }; frame: number; ending?: boolean };
let drag: DragState | undefined, pointerDrag: PointerDrag | undefined, pendingRender = false;
const cardTargets = new WeakMap<HTMLElement, DropTarget>(), rowTargets = new WeakMap<HTMLElement, DropTarget>();
function clearDropFeedback(): void {
  document.querySelectorAll('.drop-target, .insert-before, .insert-after').forEach(e => e.classList.remove('drop-target', 'insert-before', 'insert-after'));
}
function finishDrag(): void {
  drag = undefined; pointerDrag = undefined; clearDropFeedback();
  if (pendingRender) { pendingRender = false; void Promise.all([load(), refreshSaved(true)]).catch(report); }
}
function validTarget(state: DragState, target: DropTarget): boolean {
  const action = dropAction(state.source, target);
  if (action === 'none') return !!(state.openTabs && target.kind === 'open' && state.openTabs.some(t => t.windowId !== target.windowId || t.groupId !== target.groupId));
  if (action === 'reorder' && target.kind === 'open' && state.openTabs && target.rowIndex !== undefined && state.openTabs.every(t => t.windowId === target.windowId && t.groupId === target.groupId)) {
    const indices = state.openTabs.map(t => t.index).sort((a, b) => a - b);
    if (indices.every((n, i) => n === indices[0] + i) && target.rowIndex >= indices[0] && target.rowIndex <= indices[indices.length - 1] + 1) return false;
  }
  return true;
}
function updatePointerTarget(p: PointerDrag): void {
  clearDropFeedback(); p.target = undefined; p.targetElement = undefined; p.siteTarget = undefined;
  const hit = document.elementFromPoint(p.x, p.y);
  if (drag?.groupId !== undefined) {
    const card = hit?.closest<HTMLElement>('.saved-group');
    const id = card ? Number(card.dataset.sessionId) : NaN;
    if (card && id !== drag.groupId && Number.isFinite(id)) {
      const position = insertionPosition(p.y, card.getBoundingClientRect());
      p.target = { kind: 'saved', sessionId: id, rowIndex: position === 'after' ? 1 : 0 }; p.targetElement = card;
      card.classList.add(position === 'before' ? 'insert-before' : 'insert-after');
    }
    p.clone.classList.toggle('drag-invalid', !p.target); document.body.classList.toggle('drag-not-allowed', !p.target); return;
  }
  if (drag?.site && drag.source.kind === 'saved') {
    const card = hit?.closest<HTMLElement>('.group');
    const target = card && cardTargets.get(card);
    if (card && target) {
      if (target.kind === 'saved' && target.sessionId === drag.source.sessionId) {
        const block = hit?.closest<HTMLElement>('.site-block');
        if (block && card.contains(block) && block.dataset.siteKey !== drag.site.key) {
          const after = insertionPosition(p.y, block.getBoundingClientRect()) === 'after';
          p.target = target; p.targetElement = block; p.siteTarget = { key: block.dataset.siteKey!, after };
          block.classList.add(after ? 'insert-after' : 'insert-before');
        }
      } else { p.target = target; p.targetElement = card; card.classList.add('drop-target'); }
    }
    p.clone.classList.toggle('drag-invalid', !p.target); document.body.classList.toggle('drag-not-allowed', !p.target); return;
  }
  const card = hit?.closest<HTMLElement>('.group');
  const cardTarget = card && cardTargets.get(card);
  const row = hit?.closest<HTMLElement>('.row');
  const rowTarget = row && rowTargets.get(row);
  let target = cardTarget;
  let position: 'before' | 'after' | undefined;
  if (drag?.source.kind === 'open' && rowTarget?.kind === 'open' && row && card?.contains(row)) {
    position = insertionPosition(p.y, row.getBoundingClientRect());
    target = { ...rowTarget, rowIndex: rowTarget.rowIndex! + (position === 'after' ? 1 : 0) };
  }
  if (savedSort === 'manual' && rowTarget?.kind === 'saved' && row && card?.contains(row) && drag) {
    position = insertionPosition(p.y, row.getBoundingClientRect());
    target = { ...rowTarget, rowIndex: rowTarget.rowIndex! + (position === 'after' ? 1 : 0) };
  }
  if (drag && target && card && (validTarget(drag, target) || (savedSort === 'manual' && drag.source.kind === 'saved' && target.kind === 'saved' && target.rowIndex !== undefined))) {
    p.target = target; p.targetElement = row && position ? row : card; card.classList.add('drop-target');
    if (row && position) row.classList.add(position === 'before' ? 'insert-before' : 'insert-after');
  }
  p.clone.classList.toggle('drag-invalid', !p.target); document.body.classList.toggle('drag-not-allowed', !p.target);
}
function moveClone(p: PointerDrag): void {
  p.clone.style.left = `${p.x - p.offsetX}px`; p.clone.style.top = `${p.y - p.offsetY}px`;
  updatePointerTarget(p);
}
function scrollDrag(p: PointerDrag): void {
  if (pointerDrag !== p) return;
  const speed = autoScrollSpeed(p.y, window.innerHeight);
  if (speed) { window.scrollBy(0, speed); updatePointerTarget(p); }
  p.frame = requestAnimationFrame(() => scrollDrag(p));
}
async function endPointerDrag(p: PointerDrag, cancel: boolean): Promise<void> {
  if (pointerDrag !== p || !drag || p.ending) return;
  p.ending = true; cancelAnimationFrame(p.frame); document.body.classList.remove('drag-active', 'drag-not-allowed');
  const state = drag, target = cancel ? undefined : p.target;
  const destination = target && p.targetElement ? p.targetElement.getBoundingClientRect() : p.row.getBoundingClientRect();
  clearDropFeedback();
  p.clone.style.left = `${destination.left}px`; p.clone.style.top = `${destination.top}px`;
  p.clone.classList.add(target ? 'drag-accept' : 'drag-return');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise<void>(resolve => setTimeout(resolve, target ? 150 : 180));
  p.clone.remove(); p.row.classList.remove('drag-placeholder');
  try { if (target) await performDrop(state, target, p.siteTarget); } catch (error) { report(error); } finally { finishDrag(); }
}
function setupDrag(row: HTMLElement, source: DragSource, tab: chrome.tabs.Tab | SessionTab, groupId?: number, handle: HTMLElement = row, site?: { key: string; tabs: SessionTab[] }): void {
  if (source.kind === 'open' && (tab as chrome.tabs.Tab).pinned) return;
  row.classList.add('drag-handle');
  handle.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !e.isPrimary || drag || (e.target instanceof Element && e.target.closest('input, button, select, textarea, a'))) return;
    const startX = e.clientX, startY = e.clientY, pointerId = e.pointerId;
    let ready = e.pointerType !== 'touch', started = false, ended = false;
    let lastX = startX, lastY = startY;
    const touchTimer = e.pointerType === 'touch' ? setTimeout(() => { ready = true; }, 300) : undefined;
    row.setPointerCapture(pointerId);
    const cleanup = (): void => { if (touchTimer) clearTimeout(touchTimer); row.removeEventListener('pointermove', move); row.removeEventListener('pointerup', up); row.removeEventListener('pointercancel', cancel); row.removeEventListener('lostpointercapture', cancel); };
    const move = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId || ended) return;
      lastX = event.clientX; lastY = event.clientY;
      if (!started && dragThresholdExceeded(startX, startY, lastX, lastY)) {
        if (!ready) { ended = true; cleanup(); return; }
        started = true;
        if (site) drag = { source, site };
        else if (groupId !== undefined) drag = { source, groupId };
        else if (source.kind === 'open') {
          const open = tab as chrome.tabs.Tab;
          drag = { source, openTabs: selected.has(open.id!) ? tabs.filter(t => t.id !== undefined && selected.has(t.id) && !t.pinned) : [open] };
        } else drag = { source, savedTab: tab as SessionTab };
        if (timer) clearTimeout(timer); pendingRender = true;
        const rect = row.getBoundingClientRect(), clone = row.cloneNode(true) as HTMLElement;
        clone.classList.remove('drag-handle'); clone.classList.add('drag-clone'); clone.style.width = `${rect.width}px`;
        const count = drag.site?.tabs.length ?? drag.openTabs?.length ?? 1;
        if (count > 1 || drag.site) { clone.classList.add('drag-stack'); const badge = document.createElement('span'); badge.className = 'drag-count'; badge.textContent = String(count); clone.append(badge); }
        document.body.append(clone); document.body.classList.add('drag-active'); row.classList.add('drag-placeholder');
        pointerDrag = { pointerId, row, clone, offsetX: startX - rect.left, offsetY: startY - rect.top, x: lastX, y: lastY, frame: 0 };
        scrollDrag(pointerDrag);
      }
      if (started && pointerDrag) { event.preventDefault(); pointerDrag.x = lastX; pointerDrag.y = lastY; moveClone(pointerDrag); }
    };
    const stop = (event: PointerEvent, cancelled: boolean): void => {
      if (event.pointerId !== pointerId || ended) return;
      ended = true; cleanup();
      if (started && pointerDrag) {
        event.preventDefault();
        const suppressClick = (click: MouseEvent): void => { click.preventDefault(); click.stopImmediatePropagation(); };
        document.addEventListener('click', suppressClick, { capture: true, once: true });
        setTimeout(() => document.removeEventListener('click', suppressClick, true), 0);
        if (!cancelled) { pointerDrag.x = event.clientX; pointerDrag.y = event.clientY; updatePointerTarget(pointerDrag); }
        void endPointerDrag(pointerDrag, cancelled);
      }
    };
    const up = (event: PointerEvent): void => stop(event, false);
    const cancel = (event: PointerEvent): void => stop(event, true);
    row.addEventListener('pointermove', move); row.addEventListener('pointerup', up); row.addEventListener('pointercancel', cancel); row.addEventListener('lostpointercapture', cancel);
  });
}
function setupRowDrop(row: HTMLElement, target: DropTarget): void { rowTargets.set(row, target); }
function setupDrop(card: HTMLElement, target: DropTarget): void { cardTargets.set(card, target); }
async function performDrop(state: DragState, target: DropTarget, siteTarget?: { key: string; after: boolean }): Promise<void> {
  if (state.site && state.source.kind === 'saved') {
    const sourceId = state.source.sessionId;
    if (target.kind === 'saved' && target.sessionId === sourceId && siteTarget) {
      const entry = savedEntries.find(e => e.session.id === sourceId); if (!entry) return;
      const keys = orderClusters(clusterBySite(entry.tabs), savedSiteOrder[sourceId] ?? []).map(c => c.key).filter(key => key !== state.site!.key);
      const index = keys.indexOf(siteTarget.key); if (index < 0) return;
      keys.splice(index + Number(siteTarget.after), 0, state.site.key);
      savedSiteOrder[sourceId] = keys; await chrome.storage.local.set({ savedSiteOrder });
    } else if (target.kind === 'saved' && target.sessionId !== sourceId) {
      for (const tab of state.site.tabs) await repo.moveTab(sourceId, tab.id, target.sessionId);
    } else if (target.kind === 'open') {
      for (const tab of state.site.tabs) {
        const created = await chrome.tabs.create({ windowId: target.windowId, url: tab.url, active: false });
        if (target.groupId !== -1 && created.id !== undefined) await chrome.tabs.group({ groupId: target.groupId, tabIds: [created.id] });
        await repo.removeTab(sourceId, tab.id);
      }
    }
    await Promise.all([load(), refreshSaved(true)]); return;
  }
  const action = dropAction(state.source, target);
  if (state.groupId !== undefined && target.kind === 'saved') {
    const ids = sortSavedGroups(savedEntries.map(e => e.session), 'manual', savedOrder).map(g => g.id).filter(id => id !== state.groupId);
    const index = ids.indexOf(target.sessionId); if (index < 0) return;
    ids.splice(index + (target.rowIndex || 0), 0, state.groupId); savedOrder = ids;
    await chrome.storage.local.set({ savedGroupsOrder: ids }); return;
  }
  if (state.source.kind === 'saved' && state.savedTab && target.kind === 'saved' && state.source.sessionId === target.sessionId && savedSort === 'manual' && target.rowIndex !== undefined) {
    const entry = savedEntries.find(e => e.session.id === target.sessionId); if (!entry) return;
    const ids = sortSavedTabs(entry.tabs, 'manual').map(t => t.id); const old = ids.indexOf(state.savedTab.id);
    ids.splice(old, 1); ids.splice(Math.max(0, target.rowIndex - (old < target.rowIndex ? 1 : 0)), 0, state.savedTab.id);
    await repo.reorderTabs(target.sessionId, ids); await refreshSaved(true); return;
  }
  if (action === 'none' && !(state.openTabs && target.kind === 'open' && state.openTabs.some(t => t.windowId !== target.windowId || t.groupId !== target.groupId))) return;
  if (state.source.kind === 'open' && state.openTabs && target.kind === 'open') {
    const ids = state.openTabs.map(t => t.id!).filter(id => id !== undefined);
    if (!ids.length) return;
    for (const t of state.openTabs) if (t.windowId !== target.windowId) await chrome.tabs.move(t.id!, { windowId: target.windowId, index: -1 });
    if (action !== 'reorder' || state.openTabs.some(t => t.windowId !== target.windowId || t.groupId !== target.groupId)) { if (target.groupId === -1) await chrome.tabs.ungroup(ids); else await chrome.tabs.group({ groupId: target.groupId, tabIds: ids as [number, ...number[]] }); }
    if (target.rowIndex !== undefined) {
      const removedBefore = state.openTabs.filter(t => t.windowId === target.windowId && t.index < target.rowIndex!).length;
      await chrome.tabs.move(ids, { windowId: target.windowId, index: Math.max(0, target.rowIndex - removedBefore) });
    }
    selected.clear();
  } else if (state.source.kind === 'open' && state.openTabs && target.kind === 'saved') {
    const entry = savedEntries.find(e => e.session.id === target.sessionId);
    if (!entry || !entry.tabs[0]) throw new Error('Kay\u0131tl\u0131 grup bulunamad\u0131.');
    const { saveable, skipped } = partitionSaveable(state.openTabs, isBlocked);
    if (!saveable.length) throw new Error('Bu sekmelerin hi\u00e7biri kaydedilemiyor.');
    const described = await describeTabs(saveable.map(t => ({ ...t, url: t.savedUrl })));
    const first = entry.tabs[0];
    const rowIds = await repo.appendTabs(target.sessionId, described.map(t => ({ ...t, pinned: false, group_title: first.group_title, group_color: first.group_color })));
    if (savedSort === 'manual' && target.rowIndex !== undefined) {
      const ids = (await repo.tabs(target.sessionId)).filter(t => !rowIds.includes(t.id)).map(t => t.id);
      ids.splice(target.rowIndex, 0, ...rowIds); await repo.reorderTabs(target.sessionId, ids);
    }
    await chrome.tabs.remove(saveable.map(t => t.id)); selected.clear();
    const originals = saveable.map(t => ({ windowId: t.windowId }));
    offerUndo(`${saveable.length} sekme “${entry.model.name}” grubuna eklendi${skippedNote(skipped.length)}`, async () => {
      const rows = await repo.tabs(target.sessionId);
      for (let i = 0; i < rowIds.length; i++) { const row = rows.find(t => t.id === rowIds[i]); if (row) await chrome.tabs.create({ windowId: originals[i].windowId, url: row.url, active: false }); }
      await repo.removeTabs(target.sessionId, rowIds);
    }, 'Sekmeler geri a\u00e7\u0131ld\u0131.');
  } else if (state.source.kind === 'saved' && state.savedTab) {
    if (target.kind === 'saved') {
      await repo.moveTab(state.source.sessionId, state.savedTab.id, target.sessionId);
      if (savedSort === 'manual' && target.rowIndex !== undefined) {
        const rows = await repo.tabs(target.sessionId); const moved = rows.reduce((a, b) => a.id > b.id ? a : b);
        const ids = rows.filter(t => t.id !== moved.id).map(t => t.id); ids.splice(target.rowIndex, 0, moved.id); await repo.reorderTabs(target.sessionId, ids);
      }
    }
    else { const created = await chrome.tabs.create({ windowId: target.windowId, url: state.savedTab.url, active: false }); if (target.groupId !== -1 && created.id !== undefined) await chrome.tabs.group({ groupId: target.groupId, tabIds: [created.id] }); await repo.removeTab(state.source.sessionId, state.savedTab.id); }
  }
  await Promise.all([load(), refreshSaved(true)]);
}

function offerUndo(text: string, undoAction: () => Promise<void>, doneText: string): void {
  if (undoTimer) clearTimeout(undoTimer);
  message.replaceChildren(document.createTextNode(`${text} `));
  const undo = button('Geri al', () => run(async () => {
    undo.disabled = true;
    try { await undoAction(); message.textContent = doneText; await Promise.all([load(), refreshSaved(true)]); }
    catch (error) { undo.disabled = false; throw error; }
  }));
  message.append(undo);
  undoTimer = setTimeout(() => undo.remove(), 10000);
}
/** Kayıtlı gruba eklenen satırları geri açar ve yalnızca o satırları siler. */
async function undoAppend(sessionId: number, rowIds: readonly number[], name: string): Promise<void> {
  const rows = (await repo.tabs(sessionId)).filter(tab => rowIds.includes(tab.id));
  if (!rows.length) throw new Error('Geri alınacak sekme bulunamadı.');
  await openSession(hiddenOpenTabs(rows, name), currentWindowId);
  await repo.removeTabs(sessionId, rows.map(tab => tab.id));
}
/** Aynı adlı, geçerli bir gizli kayıtlı grup varsa onu döndürür (en yenisi). */
async function findMergeTarget(title: string): Promise<{ session: Session; first: SessionTab; name: string } | undefined> {
  for (const session of await repo.findHiddenByName(title)) {
    const rows = await repo.tabs(session.id);
    const model = savedCardModel(session, rows);
    if (model.kind === 'hidden' && rows[0]) return { session, first: rows[0], name: model.name };
  }
  return undefined;
}
async function hideGroup(groupTabs: chrome.tabs.Tab[], group: chrome.tabGroups.TabGroup): Promise<void> {
  const title = group.title?.trim() || '';
  const name = title || 'Adsız grup';
  const { saveable, skipped } = partitionSaveable(groupTabs, isBlocked);
  if (!saveable.length) throw new Error('Bu gruptaki sekmelerin hiçbiri kaydedilemiyor.');
  const closeIds = saveable.map(t => t.id);
  // Adsız gruplar birbirleriyle birleştirilmez; yalnızca adı aynı olan kayıtlı gruba eklenir.
  const target = title ? await findMergeTarget(title) : undefined;
  if (target) {
    const rowIds = await repo.appendTabs(target.session.id, saveable.map(t => ({ url: t.savedUrl, title: t.title || null, pinned: false, group_title: target.first.group_title ?? (group.title || ''), group_color: target.first.group_color })));
    await chrome.tabs.remove(closeIds);
    selected.clear();
    offerUndo(`${saveable.length} sekme kayıtlı “${target.name}” grubuna eklendi${skippedNote(skipped.length)}`, () => undoAppend(target.session.id, rowIds, target.name), 'Sekmeler geri açıldı.');
  } else {
    const id = await repo.save(HIDDEN_PREFIX + name, saveable.map(t => ({ url: t.savedUrl, title: t.title || null, pinned: false, group_title: group.title || '', group_color: group.color })));
    await chrome.tabs.remove(closeIds);
    selected.clear();
    offerUndo(`“${name}” Kayıtlı gruplar'a taşındı${skippedNote(skipped.length)}`, async () => { await openSession(await repo.tabs(id), currentWindowId); await repo.delete(id); }, 'Grup geri açıldı.');
  }
  await Promise.all([load(), refreshSaved(true)]);
}
/** Seçili sekmeleri kayıtlı (gizli) gruba ekler ve kapatır; kaydedilemeyenler açık kalır. */
async function addSelectedToSaved(sessionId: number, name: string): Promise<void> {
  groupSelect.open = false;
  if (!selected.size) return;
  const { saveable, skipped } = partitionSaveable(tabs.filter(t => t.id !== undefined && selected.has(t.id)), isBlocked);
  if (!saveable.length) throw new Error('Seçili sekmelerin hiçbiri kaydedilemiyor.');
  const first = (await repo.tabs(sessionId))[0];
  if (!first) throw new Error('Kayıtlı grup bulunamadı.');
  const rowIds = await repo.appendTabs(sessionId, saveable.map(t => ({ url: t.savedUrl, title: t.title || null, pinned: false, group_title: first.group_title ?? name, group_color: first.group_color })));
  await chrome.tabs.remove(saveable.map(t => t.id));
  selected.clear();
  offerUndo(`${saveable.length} sekme “${name}” grubuna eklendi${skippedNote(skipped.length)}`, () => undoAppend(sessionId, rowIds, name), 'Sekmeler geri açıldı.');
  await Promise.all([load(), refreshSaved(true)]);
}
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
  offerUndo(`${eligible.length} sekme kaydedildi`, async () => { await openSession(await repo.tabs(id)); await repo.delete(id); }, 'Sekmeler geri açıldı.');
  await Promise.all([load(), refreshSaved(true)]);
}

async function saveCurrentWindow(closeAfterSave: boolean): Promise<void> {
  if (currentWindowId === undefined) throw new Error('Pencere bulunamadı.');
  const own = await chrome.tabs.getCurrent();
  const managerUrl = chrome.runtime.getURL('tabs.html');
  const currentTabs = tabs
    .filter(t => t.windowId === currentWindowId && t.id !== own?.id && !!(t.url || t.pendingUrl) && !isBlocked(t.url || t.pendingUrl || ''))
    .map(t => ({ ...t, url: t.url || t.pendingUrl }));
  if (!currentTabs.length) throw new Error('Bu pencerede kaydedilecek sekme yok.');
  const date = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  const fallback = `Pencere — ${two(date.getDate())}.${two(date.getMonth() + 1)} ${two(date.getHours())}:${two(date.getMinutes())}`;
  const name = windowSaveName.value.trim() || fallback;
  await repo.save(name, await describeTabs(currentTabs.filter(t => (t.url || '').split('?')[0] !== managerUrl)));
  windowSaveName.value = '';
  message.textContent = `${currentTabs.length} sekme “${name}” grubuna kaydedildi.`;
  await refreshSaved(true);
  if (closeAfterSave) {
    await suppressAutoSaveForWindow(currentWindowId);
    await closeWindowSafely(currentWindowId);
  }
}

async function groupCurrentWindowBySite(): Promise<void> {
  if (currentWindowId === undefined) throw new Error('Pencere bulunamadı.');
  const count = await groupWindowBySite(currentWindowId);
  message.textContent = count ? `${count} site grubu oluşturuldu.` : 'Gruplanacak (en az 2 sekmeli) site yok.';
  await load();
}

async function closeCurrentWindowDuplicates(): Promise<void> {
  if (currentWindowId === undefined) throw new Error('Pencere bulunamadı.');
  const duplicates = findDuplicates(tabs.filter(t => t.windowId === currentWindowId));
  const ids = duplicates.flatMap(set => set.close);
  if (!ids.length) { message.textContent = 'Bu pencerede kopya sekme yok.'; return; }
  await chrome.tabs.remove(ids);
  message.textContent = `${ids.length} kopya sekme kapatıldı.`;
  await load();
}

async function refreshSaved(force = false): Promise<void> {
  if (drag) { pendingRender = true; return; }
  const sequence = ++savedSequence;
  const sessions = await repo.list();
  const version = JSON.stringify(sessions);
  if (sequence !== savedSequence || (!force && version === savedVersion)) return;
  const entries = await Promise.all(sessions.map(async session => { const savedTabs = await repo.tabs(session.id); return { session, tabs: savedTabs, model: savedCardModel(session, savedTabs) }; }));
  if (sequence !== savedSequence) return;
  savedVersion = version; savedEntries = entries; savedLoaded = true;
  renderSaved(); renderGroupTargets();
}
/** "Kayıtlı gruplar": gizli gruplar ve kayıtlı oturumlar aynı kartla, aramaya göre süzülerek gösterilir. */
function renderSaved(): void {
  if (drag) { pendingRender = true; return; }
  const container = el('#saved'); container.replaceChildren();
  const query = search.value;
  const resolved = resolveShortcutTarget(savedEntries.map(e => e.session), shortcutTarget);
  shortcutSelect.replaceChildren(new Option('Sonra (otomatik)', ''));
  for (const entry of savedEntries) shortcutSelect.add(new Option(entry.model.name, String(entry.session.id)));
  shortcutSelect.value = resolved ? String(resolved.id) : '';
  const valid = new Set(savedEntries.map(e => e.session.id)); const pruned = savedOrder.filter(id => valid.has(id));
  if (pruned.length !== savedOrder.length) { savedOrder = pruned; void chrome.storage.local.set({ savedGroupsOrder: pruned }); }
  const siteKeys = Object.keys(savedSiteOrder);
  for (const id of siteKeys) if (savedLoaded && !valid.has(Number(id))) delete savedSiteOrder[id];
  if (siteKeys.length !== Object.keys(savedSiteOrder).length) void chrome.storage.local.set({ savedSiteOrder });
  const ordered = sortSavedGroups(savedEntries.map(e => e.session), savedSort, savedOrder);
  for (const session of ordered) { const entry = savedEntries.find(e => e.session.id === session.id)!;
    const sorted = sortSavedTabs(entry.tabs, savedSort);
    const displayed = savedSort === 'site' ? orderClusters(clusterBySite(sorted), savedSiteOrder[session.id] ?? []).flatMap(c => c.tabs) : sorted;
    const filtered = filterSavedGroup(entry.model.name, displayed, query);
    if (filtered.visible) container.append(savedCard(entry, filtered.tabs, filtered.expand));
  }
  if (!container.childElementCount) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = savedEntries.length ? 'Aramayla eşleşen kayıtlı grup yok.' : 'Henüz kayıtlı grup yok.'; container.append(empty); }
}
function savedCard({ session, model, tabs: allTabs }: SavedEntry, visibleTabs: readonly SessionTab[], expand: boolean): HTMLElement {
  const wrap = document.createElement('article'); wrap.className = `card group saved-group${model.kind === 'hidden' ? ' hidden-group' : ''}`;
  setupDrop(wrap, { kind: 'saved', sessionId: session.id });
  wrap.dataset.sessionId = String(session.id);
  const header = document.createElement('div'); header.className = 'group-header';
  if (savedSort === 'manual') setupDrag(wrap, { kind: 'saved', sessionId: session.id }, allTabs[0], session.id, header);
  const key = `hidden-group-collapsed:${session.id}`;
  let stored: string | null = null;
  try { stored = localStorage.getItem(key); } catch { /* Depolama kullanılamayabilir. */ }
  const collapsed = collapseState.get(session.id) ?? hiddenGroupCollapsed(stored, savedEntries.length);
  let isOpen = expand || !collapsed;
  const list = document.createElement('ul'); list.className = 'rows'; list.hidden = !isOpen;
  const name = button(`${model.name} · ${model.count} sekme`, () => toggle()); name.className = 'ghost name'; name.setAttribute('aria-expanded', String(isOpen));
  name.title = new Date(model.createdAt).toLocaleString('tr-TR');
  const toggle = (): void => {
    isOpen = !isOpen; list.hidden = !isOpen; name.setAttribute('aria-expanded', String(isOpen));
    if (expand) return; // Arama sırasında açılan gruplar kalıcı durumu değiştirmez.
    collapseState.set(session.id, !isOpen);
    try { localStorage.setItem(key, String(!isOpen)); } catch { /* Durum bellekte kalır. */ }
  };
  header.addEventListener('click', e => { if (e.target instanceof Element && !e.target.closest('button, details, input, .kebab-menu')) toggle(); });
  const open = (remove: boolean): void => run(async () => {
    const all = sortSavedTabs(await repo.tabs(session.id), savedSort);
    const rows = savedSort === 'site' ? orderClusters(clusterBySite(all), savedSiteOrder[session.id] ?? []).flatMap(c => c.tabs) : all;
    await openSession(model.kind === 'hidden' ? hiddenOpenTabs(rows, model.name) : rows, currentWindowId);
    if (remove) await repo.delete(session.id);
    await refreshSaved(true);
  });
  const rename = (): void => {
    const input = document.createElement('input'); input.value = model.name; input.maxLength = model.kind === 'hidden' ? 100 - HIDDEN_PREFIX.length : 100; input.setAttribute('aria-label', 'Grup adı');
    name.replaceWith(input); input.focus(); input.select();
    let done = false;
    const save = (): void => { if (done) return; done = true; run(async () => { try { if (input.value.trim()) await repo.rename(session.id, savedStoredName(model.kind, input.value)); } finally { await refreshSaved(true); } }); };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { done = true; void refreshSaved(true).catch(report); } });
  };
  if (model.kind === 'hidden') header.append(dot(model.color || 'grey'));
  header.append(name);
  if (savedSort === 'date') { const date = document.createElement('span'); date.className = 'saved-date muted'; const d = new Date(session.created_at); date.textContent = `eklendi: ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; header.append(date); }
  if (model.auto) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = 'otomatik'; header.append(chip); }
  const openButton = button('Aç', () => open(true)); openButton.title = 'Geçerli pencerede aç ve listeden kaldır';
  header.append(openButton, createKebabMenu([
    { label: 'Aç, listede kalsın', onSelect: () => open(false) },
    { label: 'Yeniden adlandır', onSelect: rename },
    { label: 'Bağlantıları kopyala', onSelect: () => run(async () => { await navigator.clipboard.writeText(exportPlain(model.name, visibleTabs)); message.textContent = `Kopyalandı (${visibleTabs.length} bağlantı)`; }) },
    { label: 'Markdown olarak kopyala', onSelect: () => run(async () => { await navigator.clipboard.writeText(exportMarkdown(model.name, visibleTabs)); message.textContent = `Kopyalandı (${visibleTabs.length} bağlantı)`; }) },
    { label: 'Sil', danger: true, confirm: true, onSelect: () => run(async () => { await repo.delete(session.id); await refreshSaved(true); }) }
  ], `${model.name} işlemleri`));
  const manualIds = sortSavedTabs(allTabs, 'manual').map(t => t.id);
  const appendRow = (tab: SessionTab, rowList: HTMLElement): void => {
    const row = document.createElement('li'); row.className = 'row saved-tab-row'; setupDrag(row, { kind: 'saved', sessionId: session.id }, tab); if (savedSort === 'manual') setupRowDrop(row, { kind: 'saved', sessionId: session.id, rowIndex: manualIds.indexOf(tab.id) });
    const view = hiddenTabModel(tab);
    const fallback = document.createElement('span'); fallback.className = 'favicon'; fallback.textContent = '🌐';
    const favicon = document.createElement('img'); favicon.alt = '';
    favicon.src = `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(tab.url)}&size=32`;
    favicon.addEventListener('error', () => favicon.replaceWith(fallback));
    row.addEventListener('click', () => run(async () => { await chrome.tabs.create({ windowId: currentWindowId, url: tab.url, active: true }); }));
    const info = document.createElement('div'); info.className = 'tab-info';
    const title = button(view.title, () => {}); title.className = 'ghost tab-title';
    const host = document.createElement('div'); host.className = 'host muted'; host.textContent = view.host; info.append(title, host);
    if (tab.note) { const note = document.createElement('div'); note.className = 'saved-note muted'; note.textContent = `📝 ${tab.note}`; info.append(note); }
    const noteButton = button('📝', () => {
      if (info.querySelector('textarea')) return;
      const editor = document.createElement('textarea'); editor.value = tab.note || ''; editor.maxLength = 500; editor.setAttribute('aria-label', 'Sekme notu');
      editor.addEventListener('click', e => e.stopPropagation());
      let done = false;
      const save = (): void => { if (done) return; done = true; run(async () => { await repo.setTabNote(session.id, tab.id, editor.value); await refreshSaved(true); }); };
      editor.addEventListener('blur', save);
      editor.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } else if (e.key === 'Escape') { done = true; editor.remove(); } });
      info.append(editor); editor.focus();
    });
    noteButton.className = `note-button${tab.note ? ' has-note' : ''}`; noteButton.title = 'Not'; noteButton.setAttribute('aria-label', 'Not'); noteButton.addEventListener('click', e => e.stopPropagation());
    const remove = button('×', () => run(async () => { await repo.removeTab(session.id, tab.id); await refreshSaved(true); }));
    remove.setAttribute('aria-label', `${view.title} kaydını kaldır`); remove.addEventListener('click', e => e.stopPropagation());
    row.append(favicon, info, noteButton, remove); rowList.append(row);
  };
  if (savedSort === 'site') {
    const fullClusters = orderClusters(clusterBySite(allTabs), savedSiteOrder[session.id] ?? []);
    const visibleIds = new Set(visibleTabs.map(t => t.id));
    for (const cluster of fullClusters) {
      const shown = cluster.tabs.filter(t => visibleIds.has(t.id)); if (!shown.length) continue;
      const block = document.createElement('li'); block.className = 'site-block'; block.dataset.siteKey = cluster.key;
      const heading = document.createElement('div'); heading.className = 'site-heading muted';
      const collapseKey = JSON.stringify([session.id, cluster.key]);
      const rows = document.createElement('ul'); rows.className = 'rows'; rows.hidden = siteCollapseState.has(collapseKey);
      const toggleSite = button(rows.hidden ? '▸' : '▾', () => { rows.hidden = !rows.hidden; toggleSite.textContent = rows.hidden ? '▸' : '▾'; toggleSite.setAttribute('aria-expanded', String(!rows.hidden)); if (rows.hidden) siteCollapseState.add(collapseKey); else siteCollapseState.delete(collapseKey); });
      toggleSite.className = 'site-toggle'; toggleSite.setAttribute('aria-label', `${cluster.label} sekmelerini daralt veya genişlet`); toggleSite.setAttribute('aria-expanded', String(!rows.hidden));
      heading.append(toggleSite);
      if (cluster.host) { const icon = document.createElement('img'); icon.alt = ''; icon.src = `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(shown[0].url)}&size=32`; heading.append(icon); }
      heading.append(document.createTextNode(`${cluster.label} · ${cluster.tabs.length}`));
      setupDrag(heading, { kind: 'saved', sessionId: session.id }, cluster.tabs[0], undefined, heading, { key: cluster.key, tabs: cluster.tabs });
      shown.forEach(tab => appendRow(tab, rows)); block.append(heading, rows); list.append(block);
    }
  } else visibleTabs.forEach(tab => appendRow(tab, list));
  wrap.append(header, list);
  return wrap;
}
async function moveSelected(windowId: number): Promise<void> { for (const id of selected) { const tab = tabs.find(t => t.id === id); if (tab && tab.windowId !== windowId) await chrome.tabs.move(id, {windowId,index:-1}); } }
groupSelect.querySelector('summary')?.addEventListener('click', e => { if (!selected.size) e.preventDefault(); });
el('#new-group').addEventListener('click', () => { if (selected.size) el('#new-form').hidden = !el('#new-form').hidden; });
function renderSwatches(): void { const s = el('#swatches'); s.replaceChildren(swatches(color, c => { color = c; renderSwatches(); })); } renderSwatches();
el<HTMLFormElement>('#new-form').addEventListener('submit', e => { e.preventDefault(); run(async () => { const first = tabs.find(t => t.id === [...selected][0]); if (!first || !selected.size) return; await moveSelected(first.windowId); const id = await chrome.tabs.group({tabIds:[...selected] as [number,...number[]],createProperties:{windowId:first.windowId}}); const nameInput = el<HTMLInputElement>('#group-name'); await chrome.tabGroups.update(id,{title:newGroupTitle(nameInput.value),color}); nameInput.value = ''; selected.clear(); el('#new-form').hidden = true; await load(); }); });
el('#ungroup').addEventListener('click', () => run(async () => { if (!selected.size) return; await chrome.tabs.ungroup([...selected]); selected.clear(); await load(); }));
el('#save-close').addEventListener('click', () => run(() => saveAndClose(tabs.filter(t => t.id !== undefined && selected.has(t.id)))));
el<HTMLFormElement>('#window-save-form').addEventListener('submit', e => { e.preventDefault(); run(() => saveCurrentWindow(false)); });
el('#window-save-close').addEventListener('click', () => run(() => saveCurrentWindow(true)));
el('#group-current-window').addEventListener('click', () => run(groupCurrentWindowBySite));
confirmSecondClick(el<HTMLButtonElement>('#dedupe-current-window'), () => run(closeCurrentWindowDuplicates), 'Kopyalar kapatılsın mı?');
confirmSecondClick(el<HTMLButtonElement>('#close'), () => run(async () => { if (!selected.size) return; await chrome.tabs.remove([...selected]); selected.clear(); await load(); }));
el('#clear').addEventListener('click', () => { selected.clear(); render(); });
confirmSecondClick(el<HTMLButtonElement>('#site'), () => run(async () => { let count = 0; for (const id of new Set(tabs.map(t => t.windowId))) count += await groupWindowBySite(id); message.textContent = `${count} grup oluşturuldu`; await load(); }), 'Tüm pencereler gruplansın mı?');
search.addEventListener('input', () => { render(); renderSaved(); }); document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (pointerDrag) { e.preventDefault(); void endPointerDrag(pointerDrag, true); } else { selected.clear(); render(); } } });
const schedule = (): void => { if (drag) { pendingRender = true; return; } if (timer) clearTimeout(timer); timer = setTimeout(() => { void load().catch(report); },150); };
chrome.tabs.onCreated.addListener(schedule); chrome.tabs.onRemoved.addListener(schedule); chrome.tabs.onUpdated.addListener(schedule); chrome.tabs.onMoved.addListener(schedule); chrome.tabs.onAttached.addListener(schedule); chrome.tabs.onDetached.addListener(schedule);
chrome.tabGroups.onCreated.addListener(schedule); chrome.tabGroups.onUpdated.addListener(schedule); chrome.tabGroups.onRemoved.addListener(schedule); chrome.tabGroups.onMoved.addListener(schedule);
const sortControl = el('#saved-sort');
function updateSortControl(): void { sortControl.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sort === savedSort))); }
sortControl.addEventListener('click', e => { const b = (e.target as Element).closest<HTMLButtonElement>('button[data-sort]'); if (!b) return; savedSort = b.dataset.sort as SavedSort; updateSortControl(); void chrome.storage.local.set({ savedGroupsSort: savedSort }); renderSaved(); });
void chrome.storage.local.get({ savedGroupsSort: 'date', savedGroupsOrder: [], savedSiteOrder: {} }).then(data => { savedSort = ['date', 'manual', 'site'].includes(data.savedGroupsSort) ? data.savedGroupsSort : 'date'; savedOrder = Array.isArray(data.savedGroupsOrder) ? data.savedGroupsOrder.filter((id: unknown) => typeof id === 'number') : []; savedSiteOrder = data.savedSiteOrder && typeof data.savedSiteOrder === 'object' && !Array.isArray(data.savedSiteOrder) ? Object.fromEntries(Object.entries(data.savedSiteOrder).filter(([, value]) => Array.isArray(value)).map(([id, value]) => [id, (value as unknown[]).filter((key): key is string => typeof key === 'string')])) : {}; updateSortControl(); renderSaved(); });
updateSortControl();
renderSelectionBar();
void load().catch(report);
void refreshSaved().catch(report);
window.addEventListener('focus', () => { void refreshSaved().catch(report); });
setInterval(() => { if (!document.hidden && !el('#saved').contains(document.activeElement)) void refreshSaved().catch(report); }, 3000);
