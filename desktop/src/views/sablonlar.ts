import { listen } from '@tauri-apps/api/event';
import { api, errText, type Snippet } from '../api';
import { debounce, h, type View } from '../dom';
import { emptyState, rowMenu } from '../view-components';

// ---------- Ana pencere: Şablonlar bölümü ----------

export function snippetsView(): View {
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Şablonlarda ara…' });
  const addBtn = h('button', {}, '+ Yeni şablon');
  const list = h('div', { class: 'card list-card' });
  const status = h('div', { class: 'muted status' });

  const fTrigger = h('input', { type: 'text', placeholder: '/merhaba veya ;merhaba', maxLength: 32, size: 20 });
  const fTitle = h('input', { type: 'text', class: 'grow', placeholder: 'Başlık', maxLength: 80 });
  const fBody = h('textarea', { rows: 6, class: 'grow', placeholder: 'Eklenecek metin' });
  const saveBtn = h('button', { class: 'primary' }, 'Kaydet');
  const cancelBtn = h('button', {}, 'Vazgeç');
  const form = h(
    'div',
    { class: 'card snippet-form' },
    h('div', { class: 'toolbar' }, fTrigger, fTitle),
    fBody,
    h('div', { class: 'toolbar' }, saveBtn, cancelBtn)
  );
  form.style.display = 'none';

  const el = h(
    'section',
    {},
    h('h2', {}, 'Şablonlar'),
    h(
      'p',
      { class: 'muted' },
      'Ctrl+Shift+Space ile her uygulamada seçici açılır; Enter ile şablon yapıştırılır. Yazarken otomatik genişletme yoktur (klavye dinlenmez).'
    ),
    h('div', { class: 'toolbar' }, search, addBtn),
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
    form.style.display = 'block';
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
        { label: 'Kopyala', run: async () => { try { await navigator.clipboard.writeText(s.body); flash('Panoya kopyaland?.'); } catch (e) { flash(errText(e)); } } },
        { label: 'Sil', danger: true, run: async () => { await api.snippetDelete(s.id); await refresh(); } }
      ]);
      list.append(h('div', { class: 'list-row clickable', title: 'Tıkla: düzenle', onClick: () => openForm(s) },
        h('div', { class: 'list-row-content' }, h('strong', {}, s.trigger), ' ' + s.title,
          h('div', { class: 'muted clamp-2' }, s.body)),
        h('div', { class: 'list-row-meta muted' }, `${s.use_count}?`),
        h('div', { class: 'list-row-actions' }, menu)));
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
  const search = h('input', { type: 'search', placeholder: 'Şablon ara… (Enter: ekle, Esc: kapat)' });
  const list = h('div', { class: 'card list-card picker-list' });
  root.append(h('div', { class: 'picker' }, search, list));

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
      list.append(h('div', { class: 'empty' }, 'Şablon yok.'));
      return;
    }
    items.forEach((it, i) => {
      list.append(
        h(
          'div',
          { class: 'list-row clickable picker-row' + (i === sel ? ' selected' : ''), onClick: () => void choose(i) },
          h(
            'div',
            { class: 'list-row-content' },
            h('strong', {}, it.trigger),
            ' ' + it.title,
            h('div', { class: 'muted clamp-2' }, it.body.length > 80 ? it.body.slice(0, 80) + '…' : it.body)
          )
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
