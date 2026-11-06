import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import type { NoteCategory } from './categories';
import { CATEGORY_LABELS, isNoteCategory, NOTE_CATEGORIES } from './categories';
import type { Note } from './repo';
import { createNotesRepo } from './repo';

const LIST_LIMIT = 50;
const PREVIEW_CHARS = 240;
const SEARCH_DEBOUNCE_MS = 250;

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Popup içindeki SlapMemo paneli. */
export function initSlapMemoPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createNotesRepo(db);
  const dom = {
    form: $<HTMLFormElement>('#memo-form'),
    text: $<HTMLTextAreaElement>('#memo-text'),
    category: $<HTMLSelectElement>('#memo-category'),
    save: $<HTMLButtonElement>('#memo-save'),
    feedback: $<HTMLElement>('#memo-feedback'),
    tabs: $<HTMLElement>('#memo-tabs'),
    search: $<HTMLInputElement>('#memo-search'),
    list: $<HTMLElement>('#memo-list'),
    empty: $<HTMLElement>('#memo-empty'),
    emptyText: $<HTMLElement>('#memo-empty-text')
  };

  let filter: NoteCategory | null = null;
  let renderSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  function showFeedback(message: string, type: 'error' | 'success' = 'error'): void {
    dom.feedback.textContent = message;
    dom.feedback.className = `feedback ${type}`;
  }

  // Kategori seçici ve sekmeler bir kez kurulur.
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
  for (const [key, label] of tabDefs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'memo-tab';
    button.textContent = label;
    button.addEventListener('click', () => {
      filter = key === 'all' ? null : key;
      void render();
    });
    tabButtons.set(key, button);
    dom.tabs.append(button);
  }

  function buildItem(note: Note): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'memo-item';

    const head = document.createElement('div');
    head.className = 'memo-head';
    const badge = document.createElement('span');
    badge.className = 'memo-badge';
    badge.textContent = isNoteCategory(note.category) ? CATEGORY_LABELS[note.category] : note.category;
    const date = document.createElement('span');
    date.className = 'memo-date';
    date.textContent = formatDate(note.created_at);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.textContent = '×';
    remove.title = 'Notu sil';
    remove.setAttribute('aria-label', 'Notu sil');
    remove.addEventListener('click', () => {
      void (async () => {
        try {
          await repo.deleteNote(note.id);
          await render();
        } catch {
          showFeedback('Not silinemedi. Tekrar dene.');
        }
      })();
    });
    head.append(badge, date, remove);

    const body = document.createElement('p');
    body.className = 'memo-text';
    body.textContent = truncate(note.text, PREVIEW_CHARS);
    if (note.text.length > PREVIEW_CHARS) body.title = note.text;

    item.append(head, body);

    if (note.url && isHttpUrl(note.url)) {
      const link = document.createElement('a');
      link.className = 'memo-source';
      link.href = note.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      link.textContent = truncate(note.page_title || note.url, 70);
      link.title = note.url;
      item.append(link);
    }

    const mine = document.createElement('input');
    mine.type = 'text';
    mine.className = 'memo-mine';
    mine.placeholder = 'notum…';
    mine.maxLength = 500;
    mine.value = note.user_note ?? '';
    mine.setAttribute('aria-label', 'Notum');
    mine.addEventListener('change', () => {
      void (async () => {
        try {
          await repo.updateUserNote(note.id, mine.value);
          showFeedback('Notun güncellendi.', 'success');
        } catch {
          showFeedback('Not güncellenemedi. Tekrar dene.');
        }
      })();
    });
    item.append(mine);

    return item;
  }

  async function render(): Promise<void> {
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
      if (seq !== renderSeq) return; // Daha yeni bir istek var; eski sonucu at.

      dom.list.replaceChildren(...notes.map(buildItem));
      dom.empty.hidden = notes.length > 0;
      dom.emptyText.textContent = query ? 'Aramanla eşleşen not yok.' : 'Henüz not yok. Yukarıdan ekleyebilirsin.';
    } catch {
      if (seq !== renderSeq) return;
      showFeedback('Notlar yüklenemedi. Eklentiyi yeniden açmayı dene.');
    }
  }

  dom.form.addEventListener('submit', event => {
    event.preventDefault();
    void (async () => {
      const text = dom.text.value.trim();
      if (!text) {
        showFeedback('Kaydedilecek bir metin yaz.');
        dom.text.focus();
        return;
      }
      const category = isNoteCategory(dom.category.value) ? dom.category.value : 'note';
      dom.save.disabled = true;
      try {
        const { duplicate } = await repo.addNote({ category, text });
        dom.text.value = '';
        showFeedback(duplicate ? 'Bu not zaten kayıtlı.' : 'Kaydedildi.', duplicate ? 'error' : 'success');
        await render();
      } catch {
        showFeedback('Not kaydedilemedi. Tekrar dene.');
      } finally {
        dom.save.disabled = false;
      }
    })();
  });

  dom.search.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { void render(); }, SEARCH_DEBOUNCE_MS);
  });

  return { render };
}
