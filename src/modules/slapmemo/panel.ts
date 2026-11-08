import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  formatRelativeDate,
  showToast,
  type KebabMenuItem
} from '../../panel/ui';
import type { NoteCategory } from './categories';
import { CATEGORY_LABELS, isNoteCategory, NOTE_CATEGORIES } from './categories';
import type { Note } from './repo';
import { createNotesRepo } from './repo';
import { BUBBLE_ENABLED_KEY, BUBBLE_HIDDEN_KEY, BUBBLE_ORIGINS } from './bubble-logic';
import { NOTE_HINT_ENABLED_KEY } from './page-hint';

const LIST_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;

const EMPTY_TITLES: Record<NoteCategory | 'all', string> = {
  all: 'Henüz not yok.',
  note: 'Notlar kategorisinde henüz kayıt yok.',
  read: 'Okunacaklar kategorisinde henüz kayıt yok.',
  watch: 'İzlenecekler kategorisinde henüz not yok.',
  idea: 'Fikirler kategorisinde henüz kayıt yok.'
};

const EMPTY_HINT = "Bir sayfada metin seçip sağ tıkla → SlapMemo'ya kaydet";

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

/** LifeTools Paneli içindeki SlapMemo (Notlar) görünümü. */
export function initSlapMemoPanel(db: Executor = popupDb): { render(): Promise<void>; openNewForm(): void } {
  const repo = createNotesRepo(db);
  const dom = {
    newBtn: document.querySelector<HTMLButtonElement>('#memo-new-btn'),
    form: $<HTMLFormElement>('#memo-form'),
    text: $<HTMLTextAreaElement>('#memo-text'),
    category: $<HTMLSelectElement>('#memo-category'),
    save: $<HTMLButtonElement>('#memo-save'),
    cancel: document.querySelector<HTMLButtonElement>('#memo-cancel'),
    feedback: $<HTMLElement>('#memo-feedback'),
    tabs: $<HTMLElement>('#memo-tabs'),
    search: $<HTMLInputElement>('#memo-search'),
    list: $<HTMLElement>('#memo-list'),
    empty: $<HTMLElement>('#memo-empty')
  };

  let filter: NoteCategory | null = null;
  let editingId: number | null = null;
  let renderSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const bubbleToggle = document.querySelector<HTMLInputElement>('#memo-bubble-enabled');
  const hintToggle = document.querySelector<HTMLInputElement>('#memo-hint-enabled');
  hintToggle?.addEventListener('change', () => {
    const requested = hintToggle.checked;
    const permission = requested ? chrome.permissions.request({ origins: BUBBLE_ORIGINS }) : Promise.resolve(true);
    void permission.then(async granted => {
      if (!granted) { hintToggle.checked = false; notify('Site izni verilmedi.', 'error'); return; }
      await chrome.storage.local.set({ [NOTE_HINT_ENABLED_KEY]: requested });
    }).catch(() => { hintToggle.checked = !requested; notify('Ayar kaydedilemedi.', 'error'); });
  });
  const bubbleSites = document.querySelector<HTMLElement>('#memo-bubble-sites');
  const bubbleEmpty = document.querySelector<HTMLElement>('#memo-bubble-empty');
  async function renderBubbleSettings(): Promise<void> {
    if (!bubbleToggle || !bubbleSites || !bubbleEmpty) return;
    const data = await chrome.storage.local.get({ [BUBBLE_ENABLED_KEY]: false, [BUBBLE_HIDDEN_KEY]: [] });
    bubbleToggle.checked = data[BUBBLE_ENABLED_KEY] === true && await chrome.permissions.contains({ origins: BUBBLE_ORIGINS });
    const sites: string[] = Array.isArray(data[BUBBLE_HIDDEN_KEY]) ? data[BUBBLE_HIDDEN_KEY].filter((site: unknown): site is string => typeof site === 'string') : [];
    bubbleEmpty.hidden = sites.length > 0;
    bubbleSites.replaceChildren();
    for (const site of sites) {
      const item = document.createElement('li'); item.className = 'chip';
      const label = document.createElement('span'); label.textContent = site;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `${site} gizlemesini kaldır`);
      remove.addEventListener('click', () => { void (async () => {
        const current = await chrome.storage.local.get({ [BUBBLE_HIDDEN_KEY]: [] });
        const list = Array.isArray(current[BUBBLE_HIDDEN_KEY]) ? current[BUBBLE_HIDDEN_KEY] : [];
        await chrome.storage.local.set({ [BUBBLE_HIDDEN_KEY]: list.filter((value: unknown) => value !== site) });
        await renderBubbleSettings();
      })().catch(() => notify('Site kaldırılamadı.', 'error')); });
      item.append(label, remove); bubbleSites.append(item);
    }
  }
  bubbleToggle?.addEventListener('change', () => {
    const requested = bubbleToggle.checked;
    const permission = requested ? chrome.permissions.request({ origins: BUBBLE_ORIGINS }) : Promise.resolve(true);
    void permission.then(async granted => {
      if (!granted) { bubbleToggle.checked = false; notify('Site izni verilmedi.', 'error'); return; }
      await chrome.storage.local.set({ [BUBBLE_ENABLED_KEY]: requested });
    }).catch(() => { bubbleToggle.checked = !requested; notify('Ayar kaydedilemedi.', 'error'); });
  });

  function notify(message: string, type: 'error' | 'success' = 'success'): void {
    dom.feedback.textContent = message;
    dom.feedback.className = `feedback ${type}`;
    showToast(message, type === 'error' ? 'error' : 'info');
  }

  function toggleNewForm(open?: boolean): void {
    const show = open ?? dom.form.hidden;
    dom.form.hidden = !show;
    if (show) {
      if (filter) dom.category.value = filter;
      dom.text.focus();
    } else {
      dom.form.reset();
    }
  }

  dom.newBtn?.addEventListener('click', () => toggleNewForm());
  dom.cancel?.addEventListener('click', () => toggleNewForm(false));

  dom.category.replaceChildren();
  for (const category of NOTE_CATEGORIES) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = CATEGORY_LABELS[category];
    dom.category.append(option);
  }

  const tabButtons = new Map<NoteCategory | 'all', HTMLButtonElement>();
  const tabDefs: Array<[NoteCategory | 'all', string]> = [
    ['all', 'Tümü'],
    ...NOTE_CATEGORIES.map((c): [NoteCategory, string] => [c, CATEGORY_LABELS[c]])
  ];
  dom.tabs.replaceChildren();
  for (const [key, label] of tabDefs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'seg-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      filter = key === 'all' ? null : key;
      void render();
    });
    tabButtons.set(key, button);
    dom.tabs.append(button);
  }

  function buildItem(note: Note): HTMLLIElement {
    const contentWrap = document.createElement('div');
    contentWrap.className = 'memo-row-main';

    const body = document.createElement('p');
    body.className = 'memo-text clamp-2';
    body.textContent = note.text;
    if (note.text.length > 140) body.title = note.text;
    contentWrap.append(body);

    if (note.user_note) {
      const userNote = document.createElement('p');
      userNote.className = 'memo-user-note muted';
      userNote.textContent = `Notum: ${note.user_note}`;
      contentWrap.append(userNote);
    }

    if (editingId === note.id) {
      const editor = document.createElement('form');
      editor.className = 'inline-editor';
      editor.noValidate = true;

      const textInput = document.createElement('textarea');
      textInput.rows = 3;
      textInput.maxLength = 5000;
      textInput.value = note.text;
      textInput.setAttribute('aria-label', 'Not metni');

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.maxLength = 500;
      noteInput.placeholder = 'Notum (isteğe bağlı)…';
      noteInput.value = note.user_note ?? '';
      noteInput.setAttribute('aria-label', 'Notum');

      const actions = document.createElement('div');
      actions.className = 'inline-editor-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Kaydet';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Vazgeç';
      cancelBtn.addEventListener('click', () => {
        editingId = null;
        void render();
      });
      actions.append(saveBtn, cancelBtn);

      editor.append(textInput, noteInput, actions);
      editor.addEventListener('submit', event => {
        event.preventDefault();
        void (async () => {
          const nextText = textInput.value.trim();
          if (!nextText) {
            notify('Not metni boş olamaz.', 'error');
            textInput.focus();
            return;
          }
          saveBtn.disabled = true;
          try {
            await repo.updateNote(note.id, nextText, noteInput.value);
            editingId = null;
            notify('Not güncellendi.', 'success');
            await render();
          } catch {
            notify('Not güncellenemedi. Tekrar dene.', 'error');
          } finally {
            saveBtn.disabled = false;
          }
        })();
      });

      contentWrap.append(editor);
    }

    const metaWrap = document.createElement('div');
    metaWrap.className = 'memo-meta';

    if (filter === null) {
      const badge = document.createElement('span');
      badge.className = 'chip';
      badge.textContent = isNoteCategory(note.category) ? CATEGORY_LABELS[note.category] : note.category;
      metaWrap.append(badge);
    }

    const domain = extractDomain(note.url);
    if (domain && note.url) {
      const link = document.createElement('a');
      link.className = 'muted-link';
      link.href = note.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = domain;
      link.title = note.page_title ? `${note.page_title} (${note.url})` : note.url;
      metaWrap.append(link);
    }

    const date = document.createElement('span');
    date.className = 'memo-date muted';
    date.textContent = formatRelativeDate(note.created_at);
    date.title = new Date(note.created_at).toLocaleString('tr-TR');
    metaWrap.append(date);

    const menuItems: KebabMenuItem[] = [
      {
        label: 'Düzenle',
        icon: 'pencil',
        onSelect: () => {
          editingId = editingId === note.id ? null : note.id;
          void render();
        }
      },
      {
        label: 'Kopyala',
        icon: 'copy',
        onSelect: async () => {
          try {
            await navigator.clipboard.writeText(note.text);
            notify('Not kopyalandı.', 'success');
          } catch {
            notify('Not kopyalanamadı.', 'error');
          }
        }
      }
    ];

    if (domain && note.url) {
      const targetUrl = note.url;
      menuItems.push({
        label: 'Kaynağı aç',
        icon: 'external-link',
        onSelect: () => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      });
    }

    menuItems.push({
      label: 'Sil',
      icon: 'trash-2',
      danger: true,
      confirm: true,
      onSelect: async () => {
        try {
          await repo.deleteNote(note.id);
          if (editingId === note.id) editingId = null;
          notify('Not silindi.', 'success');
          await render();
        } catch {
          notify('Not silinemedi. Tekrar dene.', 'error');
        }
      }
    });

    return createListRow({
      content: contentWrap,
      meta: metaWrap,
      actions: createKebabMenu(menuItems, 'Not işlemleri'),
      className: 'memo-item'
    });
  }

  async function render(): Promise<void> {
    void renderBubbleSettings().catch(() => {});
    if (hintToggle) void chrome.storage.local.get({ [NOTE_HINT_ENABLED_KEY]: false }).then(async data => { hintToggle.checked = data[NOTE_HINT_ENABLED_KEY] === true && await chrome.permissions.contains({ origins: BUBBLE_ORIGINS }); }).catch(() => {});
    const seq = ++renderSeq;
    for (const [key, button] of tabButtons) {
      const active = (key === 'all' ? null : key) === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    const query = dom.search.value.trim();
    try {
      const notes = query
        ? await repo.searchNotes(query, filter)
        : await repo.listNotes({ category: filter, limit: LIST_LIMIT, offset: 0 });
      if (seq !== renderSeq) return;

      dom.list.replaceChildren(...notes.map(buildItem));
      dom.list.hidden = notes.length === 0;
      dom.empty.hidden = notes.length > 0;
      if (notes.length === 0) {
        const key: NoteCategory | 'all' = filter ?? 'all';
        dom.empty.replaceChildren(
          createEmptyState({
            icon: 'notebook-pen',
            title: query ? 'Aramanla eşleşen not yok.' : EMPTY_TITLES[key],
            hint: EMPTY_HINT
          })
        );
      }
    } catch {
      if (seq !== renderSeq) return;
      notify('Notlar yüklenemedi. Eklentiyi yeniden açmayı dene.', 'error');
    }
  }

  dom.text.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      dom.form.requestSubmit();
    }
  });

  dom.form.addEventListener('submit', event => {
    event.preventDefault();
    void (async () => {
      const text = dom.text.value.trim();
      if (!text) {
        notify('Kaydedilecek bir metin yaz.', 'error');
        dom.text.focus();
        return;
      }
      const category = isNoteCategory(dom.category.value) ? dom.category.value : 'note';
      dom.save.disabled = true;
      try {
        const { duplicate } = await repo.addNote({ category, text });
        dom.text.value = '';
        dom.form.hidden = true;
        notify(duplicate ? 'Bu not zaten kayıtlı.' : 'Not kaydedildi.', duplicate ? 'error' : 'success');
        await render();
      } catch {
        notify('Not kaydedilemedi. Tekrar dene.', 'error');
      } finally {
        dom.save.disabled = false;
      }
    })();
  });

  dom.search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void render();
    }, SEARCH_DEBOUNCE_MS);
  });

  return { render, openNewForm: () => toggleNewForm(true) };
}
