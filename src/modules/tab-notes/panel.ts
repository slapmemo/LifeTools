import { isModuleEnabled } from '../../core/module-state';
import { popupDb } from '../../db/client';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  formatRelativeDate,
  showToast
} from '../../panel/ui';
import { LABEL_TITLE_KEY, PRESET_TAB_LABELS, TAB_LABELS_ID } from '../tab-labels/background';
import { createTabLabelsRepo, type TabLabel } from '../tab-labels/repo';
import { TAB_SWITCHER_ID } from '../tab-switcher/background';
import { TITLE_CLEANER_ID } from '../title-cleaner';
import { TITLE_RULES_KEY, type TitleRules } from '../title-cleaner/cleaner';
import { SHOW_NOTE_KEY, TAB_NOTES_ID, TRANSFER_KEY } from './background';
import { createTabNotesRepo, type TabNote } from './repo';

const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

interface CombinedTabEntry {
  url: string;
  label: string | null;
  note: string | null;
  updated_at: number;
}

export function mergeTabItems(
  labels: readonly TabLabel[],
  notes: readonly TabNote[]
): CombinedTabEntry[] {
  const map = new Map<string, CombinedTabEntry>();
  for (const l of labels) {
    map.set(l.url, { url: l.url, label: l.label, note: null, updated_at: l.updated_at });
  }
  for (const n of notes) {
    const existing = map.get(n.url);
    if (existing) {
      existing.note = n.note;
      existing.updated_at = Math.max(existing.updated_at, n.updated_at);
    } else {
      map.set(n.url, { url: n.url, label: null, note: n.note, updated_at: n.updated_at });
    }
  }
  return [...map.values()].sort((a, b) => b.updated_at - a.updated_at);
}

export function initTabToolsPanel(): { render(): Promise<void> } {
  const labelInput = get<HTMLInputElement>('tab-label');
  const labelChipsWrap = document.getElementById('tab-label-chips');
  const noteInput = get<HTMLTextAreaElement>('tab-note');
  const transfer = get<HTMLInputElement>('tab-note-transfer');
  const showTitle = get<HTMLInputElement>('tab-label-title');
  const showNote = get<HTMLInputElement>('tab-note-revisit');
  const refreshLabel = (target: string) => chrome.runtime.sendMessage({ type: 'tab-labels:refresh', url: target });
  const ruleHostInput = document.getElementById('title-rule-host') as HTMLInputElement | null;
  const rulesInput = get<HTMLTextAreaElement>('title-rule');
  const rulesList = document.getElementById('title-rules-list');
  const feedback = get<HTMLElement>('tab-tools-feedback');
  const currentUrlEl = document.getElementById('tab-current-url');
  const currentCard = document.getElementById('tab-current-card');
  const savedCard = document.getElementById('tab-saved-card');
  const savedList = document.getElementById('tab-saved-list');
  const savedEmpty = document.getElementById('tab-saved-empty');
  const savedCount = document.getElementById('tab-saved-count');

  let url = '';
  let host = '';
  const labels = createTabLabelsRepo(popupDb);
  const notes = createTabNotesRepo(popupDb);

  function notify(text: string, isError = false): void {
    feedback.textContent = text;
    feedback.className = isError ? 'feedback error' : 'feedback';
    showToast(text, isError ? 'error' : 'info');
  }

  function action(fn: () => Promise<void>): void {
    void fn().catch(err => {
      notify(err instanceof Error ? err.message : 'İşlem başarısız.', true);
    });
  }

  function renderLabelChips(currentLabel: string): void {
    if (!labelChipsWrap) return;
    labelChipsWrap.replaceChildren();
    for (const preset of PRESET_TAB_LABELS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const active = currentLabel === preset;
      btn.className = `chip chip-toggle${active ? ' active' : ''}`;
      btn.setAttribute('aria-pressed', String(active));
      btn.textContent = preset;
      btn.addEventListener('click', () =>
        action(async () => {
          if (!url) throw new Error('Sekme adresi bulunamadı.');
          const next = currentLabel === preset ? '' : preset;
          await labels.set(url, next);
          await refreshLabel(url);
          labelInput.value = next;
          notify(next ? `Etiket "${next}" olarak kaydedildi.` : 'Etiket kaldırıldı.');
          await render();
        })
      );
      labelChipsWrap.append(btn);
    }
  }

  function renderSavedUrls(entries: CombinedTabEntry[], le: boolean, ne: boolean): void {
    if (!savedList) return;
    savedList.replaceChildren(
      ...entries.map(entry => {
        const content = document.createElement('div');
        content.className = 'tab-saved-main';

        const link = document.createElement('a');
        link.href = entry.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'tab-saved-url clamp-1';
        link.textContent = extractDomain(entry.url) ? `${extractDomain(entry.url)} — ${entry.url}` : entry.url;
        content.append(link);

        if (entry.note) {
          const noteP = document.createElement('p');
          noteP.className = 'memo-user-note muted clamp-2';
          noteP.textContent = entry.note;
          content.append(noteP);
        }

        const meta = document.createElement('div');
        meta.className = 'memo-meta';
        if (entry.label) {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = entry.label;
          meta.append(chip);
        }
        const date = document.createElement('span');
        date.className = 'muted';
        date.textContent = formatRelativeDate(entry.updated_at);
        meta.append(date);

        const menu = createKebabMenu(
          [
            {
              label: 'Sayfayı aç',
              icon: 'external-link',
              onSelect: () => {
                window.open(entry.url, '_blank', 'noopener,noreferrer');
              }
            },
            {
              label: 'Sil',
              icon: 'trash-2',
              danger: true,
              confirm: true,
              onSelect: () =>
                action(async () => {
                  if (le && entry.label) { await labels.delete(entry.url); await refreshLabel(entry.url); }
                  if (ne && entry.note) await notes.delete(entry.url);
                  notify('Kayıt silindi.');
                  await render();
                })
            }
          ],
          'Kayıt işlemleri'
        );

        return createListRow({
          content,
          meta,
          actions: menu,
          className: 'tab-saved-item'
        });
      })
    );

    savedList.hidden = entries.length === 0;
    if (savedCount) savedCount.textContent = String(entries.length);
    if (savedEmpty) {
      savedEmpty.hidden = entries.length > 0;
      if (entries.length === 0) {
        savedEmpty.replaceChildren(
          createEmptyState({
            icon: 'layout-grid',
            title: 'Henüz etiketli veya notlu sayfa yok.',
            hint: 'Yukarıdan etkin sekmeye etiket seçebilir veya not bırakabilirsin.'
          })
        );
      }
    }
  }

  function renderTitleRulesList(allRules: TitleRules): void {
    if (!rulesList) return;
    rulesList.replaceChildren();
    const hosts = Object.keys(allRules).filter(h => (allRules[h]?.length ?? 0) > 0);
    if (hosts.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'Henüz özel başlık kuralı eklenmedi.';
      rulesList.append(li);
      return;
    }
    for (const h of hosts) {
      const li = document.createElement('li');
      li.className = 'chip site-chip';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'ghost chip-select';
      selectBtn.textContent = `${h} (${allRules[h].length})`;
      selectBtn.title = allRules[h].join(', ');
      selectBtn.addEventListener('click', () => {
        host = h;
        if (ruleHostInput) ruleHostInput.value = h;
        rulesInput.value = (allRules[h] ?? []).join('\n');
        rulesInput.focus();
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'chip-remove';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('aria-label', `${h} kurallarını sil`);
      removeBtn.addEventListener('click', () =>
        action(async () => {
          const data = await chrome.storage.local.get({ [TITLE_RULES_KEY]: {} });
          const next = { ...(data[TITLE_RULES_KEY] as TitleRules) };
          delete next[h];
          await chrome.storage.local.set({ [TITLE_RULES_KEY]: next });
          if (host === h) rulesInput.value = '';
          notify(`${h} kuralları kaldırıldı.`);
          await render();
        })
      );

      li.append(selectBtn, removeBtn);
      rulesList.append(li);
    }
  }

  async function render(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    url = tab?.url || '';
    let activeHost = '';
    try {
      activeHost = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      activeHost = '';
    }
    if (!host || (ruleHostInput && !ruleHostInput.value.trim())) {
      host = activeHost;
    }
    if (ruleHostInput && document.activeElement !== ruleHostInput) {
      ruleHostInput.value = host;
    }
    if (currentUrlEl) {
      currentUrlEl.textContent = tab?.title ? `${tab.title} (${activeHost || url})` : url || 'Etkin sekme bulunamadı';
    }

    const [le, ne, ce, se, data] = await Promise.all([
      isModuleEnabled(TAB_LABELS_ID),
      isModuleEnabled(TAB_NOTES_ID),
      isModuleEnabled(TITLE_CLEANER_ID),
      isModuleEnabled(TAB_SWITCHER_ID),
      chrome.storage.local.get({ [TRANSFER_KEY]: false, [LABEL_TITLE_KEY]: false, [SHOW_NOTE_KEY]: false, [TITLE_RULES_KEY]: {} })
    ]);

    get<HTMLElement>('tab-tools').hidden = !(le || ne || ce || se);
    get<HTMLElement>('tab-labels-controls').hidden = !le;
    get<HTMLElement>('tab-notes-controls').hidden = !ne;
    if (currentCard) currentCard.hidden = !(le || ne);
    if (savedCard) savedCard.hidden = !(le || ne);
    get<HTMLElement>('title-cleaner-controls').hidden = !ce;
    get<HTMLElement>('open-switcher').hidden = !se;

    const currentLabel = url && le ? (await labels.get(url))?.label || '' : '';
    labelInput.value = currentLabel;
    renderLabelChips(currentLabel);

    noteInput.value = url && ne ? (await notes.get(url))?.note || '' : '';
    transfer.checked = Boolean(data[TRANSFER_KEY]);
    showTitle.checked = data[LABEL_TITLE_KEY] === true;
    showNote.checked = data[SHOW_NOTE_KEY] === true;

    const allRules = (data[TITLE_RULES_KEY] as TitleRules) || {};
    const targetHost = (ruleHostInput?.value.trim().toLowerCase().replace(/^www\./, '')) || host;
    if (document.activeElement !== rulesInput) {
      rulesInput.value = (allRules[targetHost] || []).join('\n');
    }
    renderTitleRulesList(allRules);

    if (le || ne) {
      const [allLabels, allNotes] = await Promise.all([
        le ? labels.list() : Promise.resolve([]),
        ne ? notes.list() : Promise.resolve([])
      ]);
      renderSavedUrls(mergeTabItems(allLabels, allNotes), le, ne);
    }
  }

  ruleHostInput?.addEventListener('change', () => {
    void (async () => {
      host = ruleHostInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      ruleHostInput.value = host;
      const data = await chrome.storage.local.get({ [TITLE_RULES_KEY]: {} });
      const allRules = (data[TITLE_RULES_KEY] as TitleRules) || {};
      rulesInput.value = (allRules[host] || []).join('\n');
    })();
  });

  get('tab-label-save').addEventListener('click', () =>
    action(async () => {
      if (!url) throw new Error('Sekme adresi bulunamadı.');
      await labels.set(url, labelInput.value);
      await refreshLabel(url);
      notify('Etiket kaydedildi.');
      await render();
    })
  );

  get('tab-note-save').addEventListener('click', () =>
    action(async () => {
      if (!url) throw new Error('Sekme adresi bulunamadı.');
      await notes.set(url, noteInput.value);
      notify('Not kaydedildi.');
      await render();
    })
  );

  transfer.addEventListener('change', () =>
    action(async () => {
      await chrome.storage.local.set({ [TRANSFER_KEY]: transfer.checked });
      notify(transfer.checked ? 'Kapanışta SlapMemo aktarımı açıldı.' : 'Kapanışta SlapMemo aktarımı kapatıldı.');
    })
  );
  showTitle.addEventListener('change', () => action(async () => { await chrome.storage.local.set({ [LABEL_TITLE_KEY]: showTitle.checked }); }));
  showNote.addEventListener('change', () => action(async () => { await chrome.storage.local.set({ [SHOW_NOTE_KEY]: showNote.checked }); }));

  get('title-rule-save').addEventListener('click', () =>
    action(async () => {
      const targetHost = (ruleHostInput?.value || host).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (!targetHost) throw new Error('Site adresi bulunamadı.');
      host = targetHost;
      if (ruleHostInput) ruleHostInput.value = targetHost;
      const data = await chrome.storage.local.get({ [TITLE_RULES_KEY]: {} });
      const all = { ...(data[TITLE_RULES_KEY] as TitleRules) };
      all[targetHost] = rulesInput.value
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);
      if (!all[targetHost].length) delete all[targetHost];
      await chrome.storage.local.set({ [TITLE_RULES_KEY]: all });
      notify('Kurallar kaydedildi.');
      await render();
    })
  );

  get('open-switcher').addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html') });
  });

  return { render };
}
