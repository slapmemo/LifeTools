// Küçük hızlı not penceresi (Ayarlar'daki kısayol veya tepsi menüsü). Not ekler ve kapanır.
import { listen } from '@tauri-apps/api/event';
import { api, errText, type NoteCategory } from './api';
import { h } from './dom';

const CATEGORIES: { id: NoteCategory; label: string }[] = [
  { id: 'note', label: 'Notlar' },
  { id: 'read', label: 'Okunacaklar' },
  { id: 'watch', label: 'İzlenecekler' },
  { id: 'idea', label: 'Fikirler' }
];
const LAST_CATEGORY_KEY = 'lifetools_quicknote_category';

export function mountQuickNote(root: HTMLElement): void {
  const text = h('textarea', { rows: 5, placeholder: 'Hızlı not… (Ctrl+Enter: kaydet · Esc: kapat)', maxLength: 10000, 'aria-label': 'Not metni' });
  const category = h('select', { 'aria-label': 'Kategori' });
  for (const c of CATEGORIES) category.append(h('option', { value: c.id }, c.label));
  try { const saved = localStorage.getItem(LAST_CATEGORY_KEY); if (saved && CATEGORIES.some((c) => c.id === saved)) category.value = saved; } catch { /* yoksay */ }
  const save = h('button', { type: 'button', class: 'primary' }, 'Kaydet');
  const error = h('div', { class: 'hint', role: 'alert' });
  root.append(h('div', { class: 'quicknote' }, h('div', { class: 'quicknote-title' }, 'Hızlı not'), text, h('div', { class: 'toolbar' }, category, error, save)));

  let busy = false;
  async function submit(): Promise<void> {
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    if (busy) return;
    busy = true;
    save.disabled = true;
    error.textContent = '';
    try {
      try { localStorage.setItem(LAST_CATEGORY_KEY, category.value); } catch { /* yoksay */ }
      await api.quicknoteAdd(category.value as NoteCategory, value);
      text.value = '';
    } catch (e) {
      error.textContent = errText(e);
    } finally {
      busy = false;
      save.disabled = false;
    }
  }

  save.addEventListener('click', () => void submit());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); void api.quicknoteHide(); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); }
  });
  void listen('quicknote-open', () => {
    error.textContent = '';
    text.focus();
  });
}
