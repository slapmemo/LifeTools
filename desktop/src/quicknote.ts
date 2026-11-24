// Küçük hızlı not penceresi (Ayarlar'daki kısayol veya tepsi menüsü). Not ekler ve kapanır.
// Not alanı ortak düzenleyicidir (shared/notes), kendi taslak anahtarı vardır.
import '../../shared/notes/notes.css';
import { loadNoteEditorUI } from '../../shared/notes/lazy';
import type { NoteEditorHandle } from '../../shared/notes/ui';
import { listen } from '@tauri-apps/api/event';
import { api, errText, type NoteCategory } from './api';
import { h } from './dom';
import { miniFooter, miniHeader } from './view-components';

const CATEGORIES: { id: NoteCategory; label: string }[] = [
  { id: 'note', label: 'Notlar' },
  { id: 'read', label: 'Okunacaklar' },
  { id: 'watch', label: 'İzlenecekler' },
  { id: 'idea', label: 'Fikirler' }
];
const LAST_CATEGORY_KEY = 'lifetools_quicknote_category';
const DRAFT_KEY = 'lifetools_quicknote_draft';

export function mountQuickNote(root: HTMLElement): void {
  const editorHost = h('div', { class: 'note-quick-editor' }, h('span', { class: 'muted' }, 'Yükleniyor…'));
  const category = h('select', { 'aria-label': 'Kategori' });
  for (const c of CATEGORIES) category.append(h('option', { value: c.id }, c.label));
  const selectSaved = (): void => {
    try { const saved = localStorage.getItem(LAST_CATEGORY_KEY); if (saved && Array.from(category.options).some((o) => o.value === saved)) category.value = saved; } catch { /* yoksay */ }
  };
  selectSaved();
  // Kullanıcı kategorilerini de göster (liste her açılışta yenilenir).
  const loadCategories = (): void => {
    void api.noteCategories().then((list) => {
      if (!list.length) return;
      const current = category.value;
      category.replaceChildren(...list.map((c) => h('option', { value: c.id }, c.label)));
      category.value = list.some((c) => c.id === current) ? current : 'note';
      selectSaved();
    }).catch(() => undefined);
  };
  loadCategories();
  const save = h('button', { type: 'button', class: 'primary' }, 'Kaydet');
  const error = h('div', { class: 'hint', role: 'alert' });
  root.append(h('div', { class: 'quicknote' }, miniHeader('pencil', 'Hızlı not'), editorHost, h('div', { class: 'toolbar' }, category, error, save), miniFooter([['Ctrl+Enter', 'kaydet'], ['Esc', 'kapat']])));

  let editor: NoteEditorHandle | null = null;
  void loadNoteEditorUI().then(({ mountNoteEditor }) => {
    editorHost.replaceChildren();
    editor = mountNoteEditor(editorHost, { compact: true, collapseRibbon: true, draftKey: DRAFT_KEY, placeholder: 'Aklındakini yaz…' });
    editor.focus();
  }).catch((e) => { error.textContent = errText(e); });

  let busy = false;
  async function submit(): Promise<void> {
    if (!editor) return;
    const value = editor.getMarkdown().trim();
    if (!value) { editor.focus(); return; }
    if (busy) return;
    busy = true;
    save.disabled = true;
    error.textContent = '';
    try {
      try { localStorage.setItem(LAST_CATEGORY_KEY, category.value); } catch { /* yoksay */ }
      await api.quicknoteAdd(category.value as NoteCategory, value);
      editor.setMarkdown('');
      editor.clearDraft();
    } catch (e) {
      error.textContent = errText(e);
    } finally {
      busy = false;
      save.disabled = false;
    }
  }

  save.addEventListener('click', () => void submit());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Önce düzenleyicinin kendi Esc'i (bul çubuğu, biçim boyacısı, odak modu) işlesin.
      if (e.defaultPrevented) return;
      e.preventDefault();
      void api.quicknoteHide();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); }
  });
  void listen('quicknote-open', () => {
    error.textContent = '';
    loadCategories();
    editor?.focus();
  });
}
