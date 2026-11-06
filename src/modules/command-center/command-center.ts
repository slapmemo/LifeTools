import { applyTheme } from '../../core/theme';
void applyTheme();
import { popupDb } from '../../db/client';
import { requestActions, requestRunAction, splitArg, type ActionInfo } from '../../core/actions';
import { isModuleEnabled } from '../../core/module-state';
import { normalizeUrl } from '../life-browser/tabs';
import { createTabLabelsRepo } from '../tab-labels/repo';
import { createTabNotesRepo } from '../tab-notes/repo';
import { filterTabs, type SearchTab } from '../tab-switcher/filter';
import { TAB_SWITCHER_ID } from '../tab-switcher/background';
import { SLAPMEMO_ID } from '../slapmemo/background';
import { createNotesRepo } from '../slapmemo/repo';
import { QUICK_TASKS_ID } from '../quick-tasks/background';
import { createTasksRepo } from '../quick-tasks/repo';
import { SMART_REPLIES_ID } from '../smart-replies/background';
import { createSnippetsRepo } from '../smart-replies/repo';
import { COMMAND_CENTER_TARGET_KEY } from './background';
import { foldSearch, parsePrefix, rankActions } from './search';

interface Row { group: string; title: string; sub?: string; run(): Promise<void> }
type TabItem = SearchTab & { tab: chrome.tabs.Tab };

const input = document.querySelector('#query') as HTMLInputElement;
const results = document.querySelector('#results') as HTMLElement;
const status = document.querySelector('#status') as HTMLElement;
const notesRepo = createNotesRepo(popupDb), tasksRepo = createTasksRepo(popupDb), snippetsRepo = createSnippetsRepo(popupDb);

let actions: ActionInfo[] = [];
let tabItems: TabItem[] = [];
let targetTabId: number | undefined;
let rows: Row[] = [];
let selected = 0;
let seq = 0;

async function load(): Promise<void> {
  const stored = await chrome.storage.session.get({ [COMMAND_CENTER_TARGET_KEY]: null });
  targetTabId = typeof stored[COMMAND_CENTER_TARGET_KEY] === 'number' ? (stored[COMMAND_CENTER_TARGET_KEY] as number) : undefined;
  actions = await requestActions();
  if (await isModuleEnabled(TAB_SWITCHER_ID)) {
    try {
      const [tabs, labels, notes, win] = await Promise.all([chrome.tabs.query({}), createTabLabelsRepo(popupDb).list(), createTabNotesRepo(popupDb).list(), chrome.windows.getCurrent()]);
      const lm = new Map(labels.map(x => [x.url, x.label])), nm = new Map(notes.map(x => [x.url, x.note]));
      tabItems = tabs.filter(tab => tab.windowId !== win.id && tab.id !== undefined).map(tab => {
        const url = tab.url || tab.pendingUrl || '';
        return { tab, url, title: tab.title || url || 'Yeni sekme', label: lm.get(normalizeUrl(url)) || '', note: nm.get(normalizeUrl(url)) || '' };
      });
    } catch { tabItems = []; }
  }
  await refresh();
}

function actionRow(action: ActionInfo, arg: string): Row {
  const base = action.title.replace(/:.*$/, '');
  return {
    group: 'Eylemler', title: action.takesArg && arg ? `${base}: ${arg}` : action.title,
    run: async () => {
      if (action.takesArg && !arg) { input.value = action.argPrefix ?? ''; input.focus(); await refresh(); return; }
      const res = await requestRunAction(action.id, arg || undefined, targetTabId);
      if (res.ok) window.close();
      else status.textContent = res.message || 'İşlem başarısız.';
    }
  };
}

async function copy(text: string, okText: string): Promise<void> {
  try { await navigator.clipboard.writeText(text); status.textContent = okText; window.close(); }
  catch { status.textContent = 'Panoya kopyalanamadı.'; }
}

async function build(query: string): Promise<Row[]> {
  const out: Row[] = [];
  const prefix = parsePrefix(query);
  if (prefix) {
    const action = actions.find(a => a.id === prefix.id);
    if (action) out.push(actionRow(action, prefix.arg));
    return out;
  }
  const split = splitArg(query);
  if (split.arg) {
    const match = rankActions(actions.filter(a => a.takesArg), split.head)[0];
    if (match) { out.push(actionRow(match, split.arg)); return out; }
  }
  const q = query.trim();
  const ranked = rankActions(actions, q);
  for (const action of ranked.slice(0, q ? 6 : 10)) out.push(actionRow(action, ''));
  if (!q) return out;

  for (const item of filterTabs(tabItems, q).slice(0, 5)) {
    out.push({ group: 'Sekmeler', title: item.title, sub: item.url, run: async () => {
      if (item.tab.id === undefined) return;
      await chrome.tabs.update(item.tab.id, { active: true }); await chrome.windows.update(item.tab.windowId, { focused: true }); window.close();
    } });
  }
  const [noteRows, taskRows, snippetRows] = await Promise.all([
    isModuleEnabled(SLAPMEMO_ID).then(async on => on ? (await notesRepo.searchNotes(q)).slice(0, 5) : []).catch(() => []),
    isModuleEnabled(QUICK_TASKS_ID).then(async on => on ? (await tasksRepo.listOpen()).filter(t => foldSearch(`${t.title} ${t.note ?? ''}`).includes(foldSearch(q))).slice(0, 5) : []).catch(() => []),
    isModuleEnabled(SMART_REPLIES_ID).then(async on => on ? (await snippetsRepo.list(q)).slice(0, 5) : []).catch(() => [])
  ]);
  for (const note of noteRows) out.push({ group: 'Notlar', title: note.text.slice(0, 120), sub: note.url ?? undefined, run: async () => {
    if (note.url) { await chrome.tabs.create({ url: note.url }); window.close(); } else await copy(note.text, 'Not kopyalandı.');
  } });
  for (const task of taskRows) out.push({ group: 'Görevler', title: task.title, sub: task.due_date ?? task.url ?? undefined, run: async () => {
    if (task.url) { await chrome.tabs.create({ url: task.url }); window.close(); } else await copy(task.title, 'Görev başlığı kopyalandı.');
  } });
  for (const snippet of snippetRows) out.push({ group: 'Şablonlar', title: `${snippet.trigger} — ${snippet.title}`, sub: snippet.body.slice(0, 100), run: () => copy(snippet.body, 'Şablon kopyalandı.') });
  return out;
}

function render(): void {
  results.replaceChildren();
  let lastGroup = '';
  rows.forEach((row, index) => {
    if (row.group !== lastGroup) { lastGroup = row.group; const h = document.createElement('h2'); h.textContent = row.group; results.append(h); }
    const el = document.createElement('button'); el.type = 'button'; el.className = 'row' + (index === selected ? ' selected' : '');
    el.setAttribute('role', 'option'); el.setAttribute('aria-selected', String(index === selected));
    el.textContent = row.title;
    if (row.sub) { const small = document.createElement('small'); small.textContent = row.sub; el.append(small); }
    el.addEventListener('click', () => { void row.run(); });
    results.append(el);
  });
  results.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  if (!rows.length) status.textContent = input.value.trim() ? 'Sonuç bulunamadı.' : 'Eylem bulunamadı.';
}

async function refresh(): Promise<void> {
  const current = ++seq;
  const next = await build(input.value).catch(() => []);
  if (current !== seq) return;
  rows = next; selected = 0; render();
}

input.addEventListener('input', () => { status.textContent = ''; void refresh(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { window.close(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (rows.length) { selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; render(); }
  } else if (event.key === 'Enter' && rows[selected]) { event.preventDefault(); void rows[selected].run(); }
});
void load();
