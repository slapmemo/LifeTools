import { initVolumePopup } from '../modules/volume-booster/popup';
import { popupDb, pingDesktop } from '../db/client';
import { getBackend } from '../db/backend';
import { createNotesRepo } from '../modules/slapmemo/repo';
import { type NoteCategory } from '../modules/slapmemo/categories';
import { createTimeTrackerRepo, type SiteTotal } from '../modules/time-tracker/repo';
import { localDay } from '../modules/time-tracker/tracker';
import { createSnippetsRepo } from '../modules/smart-replies/repo';
import { parsePrefix, rankActions } from '../core/command-search';
import { requestActions, requestRunAction, splitArg } from '../core/actions';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { popupVisibility } from '../core/ui-visibility';
import { applyTheme } from '../core/theme';
import { todayTimeLine } from './summary';
import { openTabManager } from '../modules/tab-manager/open';
import { showVersions } from '../core/desktop-version';
import { formatDuration } from '../modules/time-tracker/panel';
import { icon, type IconName } from '../../design/icons';

// HTML'deki data-icon yer tutucularını ortak Lucide ikonlarıyla doldur.
document.querySelectorAll<HTMLElement>('[data-icon]').forEach(slot => {
  slot.replaceChildren(icon(slot.dataset.icon as IconName, slot.classList.contains('card-icon') ? 18 : slot.closest('.tile') ? 20 : 16));
});

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
el('today-sites').onclick = () => openPanel('#odak');
el('open-notes').onclick = () => openPanel('#notlar');
el('open-notes-tile').onclick = () => openPanel('#notlar');
el('open-tabs-tile').onclick = () => openPanel('#sekmeler');

async function save(): Promise<void> {
  try {
    const value = text.value.trim();
    if (!value) throw new Error('Önce bir metin yaz.');
    const tab = el<HTMLInputElement>('attach').checked
      ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
      : undefined;
    await notes.addNote({
      text: value,
      category: el<HTMLSelectElement>('category').value as NoteCategory,
      url: tab?.url,
      pageTitle: tab?.title
    });
    text.value = '';
    feedback.textContent = 'Kaydedildi.';
    await summary();
  } catch (e) {
    feedback.textContent = e instanceof Error ? e.message : 'İşlem başarısız.';
  }
}

el('note').onclick = () => void save();

async function summary(): Promise<void> {
  const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
  const visible = popupVisibility(flags);
  el('volume-booster').hidden = !resolveEnabled(flags, 'volume-booster');
  el('tab-manager').hidden = !resolveEnabled(flags, 'tab-manager');
  el('note').hidden = el('category').hidden = !visible.notes;
  el('today').hidden = !visible.sites;
  el('search-area').hidden = !visible.search;
  const hasQuickInput = visible.notes;
  el('quick-card').hidden = !hasQuickInput;
  text.hidden = !hasQuickInput;
  if (el('attach').parentElement) el('attach').parentElement!.hidden = !hasQuickInput;
  const actionsWrap = el('note').parentElement;
  if (actionsWrap) actionsWrap.hidden = !hasQuickInput;

  el('open-notes-tile').hidden = !visible.notes;
  const today = localDay(Date.now());
  if (visible.sites) renderToday(await createTimeTrackerRepo(popupDb).getDay(today));
}

/** Bugün kartı: toplam süre + en çok vakit geçirilen 3 site (ikonlar Chrome'un favicon önbelleğinden). */
function renderToday(sites: SiteTotal[]): void {
  const total = sites.reduce((sum, site) => sum + site.seconds, 0);
  el('today-total').textContent = sites.length ? formatDuration(total) : '';
  el('today-sites').title = todayTimeLine(sites);
  const list = el('today-list');
  if (!sites.length) {
    const empty = document.createElement('p');
    empty.className = 'today-empty';
    empty.textContent = 'Bugün henüz süre kaydı yok';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...sites.slice(0, 3).map(site => {
    const row = document.createElement('div');
    row.className = 'today-row';
    const img = document.createElement('img');
    img.alt = '';
    img.src = `${chrome.runtime.getURL('_favicon/')}?pageUrl=${encodeURIComponent(`https://${site.domain}/`)}&size=32`;
    img.addEventListener('error', () => { const fallback = icon('monitor', 18); fallback.classList.add('fallback'); img.replaceWith(fallback); });
    const domain = document.createElement('span');
    domain.className = 'domain';
    domain.textContent = site.domain;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatDuration(site.seconds);
    row.append(img, domain, time);
    return row;
  }));
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

  const [n, s] = await Promise.all([
    vis.notes ? notes.searchNotes(q).catch(() => []) : [],
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
