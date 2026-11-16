import { listen } from '@tauri-apps/api/event';
import { icon } from '../../../design/icons';
import { api, errText, type Snippet } from '../api';
import { debounce, h, type View } from '../dom';
import { emptyState, miniFooter, miniHeader, rowMenu } from '../view-components';

// ---------- Ana pencere: Şablonlar bölümü ----------

export function snippetsView(): View {
  const search = h('input', { type: 'search', placeholder: 'Şablonlarda ara…', 'aria-label': 'Şablonlarda ara' });
  const searchBox = h('label', { class: 'search-field' }, icon('search', 16), search);
  const addBtn = h('button', { type: 'button', class: 'primary' }, icon('plus', 16), 'Yeni şablon');
  const list = h('div', { class: 'note-list' });
  const status = h('div', { class: 'muted status' });

  const fTrigger = h('input', { type: 'text', placeholder: '/merhaba veya ;merhaba', maxLength: 32, size: 20 });
  const fTitle = h('input', { type: 'text', class: 'grow', placeholder: 'Başlık', maxLength: 80 });
  const fBody = h('textarea', { rows: 6, class: 'grow', placeholder: 'Eklenecek metin' });
  const saveBtn = h('button', { class: 'primary' }, 'Kaydet');
  const cancelBtn = h('button', {}, 'Vazgeç');
  const form = h(
    'div',
    { class: 'card note-add snippet-form' },
    h('div', { class: 'note-add-input watch-add-input' }, icon('pencil', 18), fTrigger, fTitle),
    fBody,
    h('div', { class: 'toolbar' }, saveBtn, cancelBtn)
  );
  form.style.display = 'none';

  const el = h(
    'section',
    {},
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('message-square-text', 26), 'Şablonlar'),
        h('p', { class: 'page-subtitle', title: 'Seçici her uygulamada açılır; Enter ile şablon yapıştırılır. Yazarken otomatik genişletme yoktur (klavye dinlenmez).' },
          'Hazır metinler: her uygulamada Ctrl+Shift+Space ile seç, Enter ile yapıştır.')),
      h('div', { class: 'page-actions' }, searchBox, addBtn)),
    form,
    status,
    list
  );

  let editing: number | null = null;

  function flash(t: string): void {
    status.textContent = t;
    window.setTimeout(() => (status.textContent = ''), 3000);
  }

  function openForm(s: Snippet | null): void {
    editing = s ? s.id : null;
    fTrigger.value = s?.trigger ?? '/';
    fTitle.value = s?.title ?? '';
    fBody.value = s?.body ?? '';
    form.style.display = '';
    fTrigger.focus();
  }

  function closeForm(): void {
    form.style.display = 'none';
    editing = null;
  }

  async function refresh(): Promise<void> {
    const items = await api.snippetList(search.value);
    list.replaceChildren();
    if (items.length === 0) {
      list.append(emptyState(search.value ? 'Sonuç yok' : 'Henüz şablon yok', search.value ? 'Başka bir arama deneyin.' : 'Yeni bir şablon ekleyerek başlayın.'));
      return;
    }
    for (const s of items) {
      const menu = rowMenu([
        { label: 'Düzenle', run: () => openForm(s) },
        { label: 'Kopyala', run: async () => { try { await navigator.clipboard.writeText(s.body); flash('Panoya kopyalandı.'); } catch (e) { flash(errText(e)); } } },
        { label: 'Sil', danger: true, run: async () => { await api.snippetDelete(s.id); await refresh(); } }
      ]);
      const copyBtn = h('button', { type: 'button', class: 'icon-button', title: 'Metni kopyala', 'aria-label': 'Metni kopyala' }, icon('copy', 16));
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(s.body); flash('Panoya kopyalandı.'); } catch (err) { flash(errText(err)); }
      });
      list.append(h('div', { class: 'list-row clickable', title: 'Tıkla: düzenle', onClick: () => openForm(s) },
        h('span', { class: 'panel-row-icon' }, icon('message-square-text', 16)),
        h('div', { class: 'list-row-content' },
          h('div', { class: 'note-head' }, h('span', { class: 'chip chip-mono' }, s.trigger), h('strong', { class: 'clamp-1' }, s.title)),
          h('div', { class: 'muted clamp-2 snippet-body' }, s.body)),
        h('div', { class: 'list-row-meta muted', title: 'Kullanım sayısı' }, `${s.use_count} kez`),
        h('div', { class: 'list-row-actions' }, copyBtn, menu)));
    }
  }

  search.addEventListener('input', debounce(() => void refresh(), 150));
  addBtn.addEventListener('click', () => openForm(null));
  cancelBtn.addEventListener('click', closeForm);
  saveBtn.addEventListener('click', async () => {
    try {
      await api.snippetSave(editing, fTrigger.value.trim(), fTitle.value, fBody.value);
      closeForm();
      flash('Kaydedildi.');
      await refresh();
    } catch (e) {
      flash(errText(e));
    }
  });

  return { el, refresh };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = snippetsView();
  return instance;
}

export function mount(container: HTMLElement): void {
  const v = ensureView();
  container.replaceChildren(v.el);
  void v.refresh();
}

export function unmount(): void {
  instance?.el.remove();
}

export function refresh(): Promise<void> | void {
  return ensureView().refresh();
}

// ---------- Küçük seçici penceresi (Ctrl+Shift+Space) ----------

export function mountSnippetPicker(root: HTMLElement): void {
  const search = h('input', { type: 'search', placeholder: 'Şablon ara…', 'aria-label': 'Şablon ara' });
  const list = h('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Şablonlar' });
  root.append(h('div', { class: 'picker' },
    miniHeader('message-square-text', 'Şablonlar'),
    h('label', { class: 'search-field' }, icon('search', 16), search),
    list,
    miniFooter([['↑↓', 'seç'], ['Enter', 'ekle'], ['Esc', 'kapat']])));

  let items: Snippet[] = [];
  let sel = 0;
  let busy = false;

  async function choose(i: number): Promise<void> {
    const it = items[i];
    if (!it || busy) return;
    busy = true;
    try {
      await api.snippetInsert(it.id);
    } catch {
      await api.snippetPickerHide();
    } finally {
      busy = false;
    }
  }

  function render(): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(h('div', { class: 'empty' }, search.value ? 'Sonuç yok.' : 'Şablon yok.'));
      return;
    }
    items.forEach((it, i) => {
      list.append(
        h(
          'div',
          { class: 'picker-row' + (i === sel ? ' selected' : ''), role: 'option', 'aria-selected': String(i === sel), onClick: () => void choose(i) },
          h('span', { class: 'chip chip-mono' }, it.trigger),
          h('div', { class: 'picker-row-main' },
            h('div', { class: 'picker-row-title clamp-1' }, it.title || it.trigger),
            h('div', { class: 'picker-row-meta clamp-1' }, it.body.replace(/\s+/g, ' ')))
        )
      );
    });
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
  }

  async function load(): Promise<void> {
    items = (await api.snippetList(search.value)).slice(0, 50);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    render();
  }

  search.addEventListener('input', () => {
    sel = 0;
    void load();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void api.snippetPickerHide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(sel + 1, Math.max(0, items.length - 1));
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void choose(sel);
    }
  });

  void listen('snippets-open', () => {
    search.value = '';
    sel = 0;
    busy = false;
    void load();
    search.focus();
  });
  void load();
  search.focus();
}
