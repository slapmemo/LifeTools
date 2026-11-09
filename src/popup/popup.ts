import { initVolumePopup } from '../modules/volume-booster/popup';
import { popupDb, pingDesktop } from '../db/client';
import { getBackend } from '../db/backend';
import { createNotesRepo } from '../modules/slapmemo/repo';
import { type NoteCategory } from '../modules/slapmemo/categories';
import { createTasksRepo, localToday } from '../modules/quick-tasks/repo';
import { createTimeTrackerRepo } from '../modules/time-tracker/repo';
import { createSnippetsRepo } from '../modules/smart-replies/repo';
import { foldSearch, parsePrefix, rankActions } from '../modules/command-center/search';
import { requestActions, requestRunAction, splitArg } from '../core/actions';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { popupVisibility } from '../core/ui-visibility';
import { applyTheme } from '../core/theme';
import { todayTimeLine, formatTasks } from './summary';
import { openTabManager } from '../modules/tab-manager/open';
import { showVersions } from '../core/desktop-version';

const versionFooter = document.createElement('footer');
versionFooter.className = 'version-footer';
const versionStatus = document.createElement('div');
const versionWarning = document.createElement('div');
versionWarning.hidden = true;
versionWarning.setAttribute('role', 'status');
versionFooter.append(versionStatus, versionWarning);
document.querySelector('main')!.append(versionFooter);
void showVersions(versionStatus, versionWarning);

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = el<HTMLInputElement>('search');
const text = el<HTMLTextAreaElement>('text');
const results = el('results');
const feedback = el('feedback');
const notes = createNotesRepo(popupDb);
const tasks = createTasksRepo(popupDb, Date.now, () => { void chrome.runtime.sendMessage({ type: 'quick-tasks:reschedule' }).catch(() => {}); });
const snippets = createSnippetsRepo(popupDb);

async function openPanelAsync(hash = ''): Promise<void> {
  const base = chrome.runtime.getURL('panel.html');
  const [existing] = await chrome.tabs.query({ url: `${base}*` });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true, ...(hash ? { url: base + hash } : {}) });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: base + hash });
  }
}

function openPanel(hash = ''): void {
  void openPanelAsync(hash);
}

el('panel').onclick = () => openPanel();
el('tab-manager').onclick = () => { void openTabManager(); };
el('settings').onclick = () => openPanel('#ayarlar');
el('desktop-banner-switch').onclick = () => openPanel('#ayarlar');
el('today-tasks').onclick = () => openPanel('#gorevler');
el('today-sites').onclick = () => openPanel('#odak');

async function save(kind: 'note' | 'task'): Promise<void> {
  try {
    const value = text.value.trim();
    if (!value) throw new Error('Önce bir metin yaz.');
    const tab = el<HTMLInputElement>('attach').checked
      ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      : undefined;
    if (kind === 'note') {
      await notes.addNote({
        text: value,
        category: el<HTMLSelectElement>('category').value as NoteCategory,
        url: tab?.url,
        pageTitle: tab?.title
      });
    } else {
      await tasks.add({ title: value, url: tab?.url });
    }
    text.value = '';
    feedback.textContent = 'Kaydedildi.';
    await summary();
  } catch (e) {
    feedback.textContent = e instanceof Error ? e.message : 'İşlem başarısız.';
  }
}

el('note').onclick = () => void save('note');
el('task').onclick = () => void save('task');

async function summary(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  const visible = popupVisibility(flags);
  el('volume-booster').hidden = !resolveEnabled(flags, 'volume-booster');
  el('tab-manager').hidden = !resolveEnabled(flags, 'tab-manager');
  el('note').hidden = el('category').hidden = !visible.notes;
  el('task').hidden = el('today-tasks').hidden = !visible.tasks;
  el('today-sites').hidden = !visible.sites;
  el('search-area').hidden = !visible.search;
  const hasQuickInput = visible.notes || visible.tasks;
  text.hidden = !hasQuickInput;
  if (el('attach').parentElement) el('attach').parentElement!.hidden = !hasQuickInput;
  const actionsWrap = el('note').parentElement;
  if (actionsWrap) actionsWrap.hidden = !hasQuickInput;
  const todaySection = el('today-tasks').parentElement;
  if (todaySection) todaySection.hidden = !visible.tasks;

  const today = localToday(Date.now());
  if (visible.tasks) {
    const rows = await tasks.listOpen();
    el('today-tasks').textContent = formatTasks(
      rows.length,
      rows.filter(t => t.due_date && t.due_date < today).length
    );
  }
  if (visible.sites) {
    el('today-sites').textContent = todayTimeLine(await createTimeTrackerRepo(popupDb).getDay(today));
  }
}

let sequence = 0;
async function search(): Promise<void> {
  const current = ++sequence;
  const q = input.value.trim();
  results.replaceChildren();
  if (!q) return;
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  const vis = popupVisibility(flags);
  if (!vis.search) return;

  const actions = await requestActions();
  const prefix = parsePrefix(q);
  const split = splitArg(q);
  const ranked = prefix
    ? actions.filter(a => a.id === prefix.id)
    : rankActions(actions, split.arg ? split.head : q);
  const rows: { title: string; run: () => Promise<void> }[] = ranked.map(a => ({
    title: a.title,
    run: async () => {
      const arg = prefix?.arg || split.arg;
      if (a.takesArg && !arg) {
        input.value = a.argPrefix || '';
        input.focus();
        return;
      }
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const r = await requestRunAction(a.id, arg || undefined, tab?.id);
      feedback.textContent = r.message || (r.ok ? 'Tamamlandı.' : 'İşlem başarısız.');
    }
  }));

  const [n, t, s] = await Promise.all([
    vis.notes ? notes.searchNotes(q).catch(() => []) : [],
    vis.tasks ? tasks.listOpen().catch(() => []) : [],
    vis.snippets ? snippets.list(q).catch(() => []) : []
  ]);

  for (const item of n) {
    rows.push({
      title: `Not · ${item.text}`,
      run: async () => {
        await navigator.clipboard.writeText(item.text);
        feedback.textContent = 'Not kopyalandı.';
      }
    });
  }
  for (const item of t.filter(x => foldSearch(x.title).includes(foldSearch(q)))) {
    rows.push({ title: `Görev · ${item.title}`, run: async () => openPanel('#gorevler') });
  }
  for (const item of s) {
    rows.push({
      title: `Şablon · ${item.title}`,
      run: async () => {
        await navigator.clipboard.writeText(item.body);
        feedback.textContent = 'Şablon kopyalandı.';
      }
    });
  }

  if (current !== sequence) return;
  for (const row of rows.slice(0, 6)) {
    const b = document.createElement('button');
    b.textContent = row.title;
    b.onclick = () => void row.run();
    results.append(b);
  }
}

input.oninput = () => void search();
input.onkeydown = e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    (results.querySelector('button') as HTMLButtonElement | null)?.click();
  }
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[MODULE_FLAGS_KEY]) {
    void summary().catch(() => {});
    void search().catch(() => {});
  }
});

void initVolumePopup().catch(() => {});
void applyTheme();
void summary().catch(() => {});
void (async () => {
  if ((await getBackend()) === 'desktop') {
    try {
      await pingDesktop();
    } catch {
      el('desktop-banner').hidden = false;
    }
  }
})();
