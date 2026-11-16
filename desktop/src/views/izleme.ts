import { icon } from '../../../design/icons';
import { api, errText, type WatchCounts, type WatchItem, type WatchKind, type WatchStatus } from '../api';
import { debounce, h, type View } from '../dom';
import { emptyState, rowMenu } from '../view-components';

// Eklentideki watchlist/panel.ts ile aynı etiketler.
const STATUSES: { id: WatchStatus; label: string }[] = [
  { id: 'izlenecek', label: 'İzlenecek' },
  { id: 'izleniyor', label: 'İzleniyor' },
  { id: 'bitti', label: 'Bitti' }
];
const KINDS: { id: WatchKind; label: string }[] = [
  { id: 'film', label: 'Film' },
  { id: 'dizi', label: 'Dizi' },
  { id: 'video', label: 'Video' },
  { id: 'diger', label: 'Diğer' }
];
const kindLabel = (id: string): string => KINDS.find((k) => k.id === id)?.label ?? id;
const fmtMs = (ms: number): string => new Date(ms).toLocaleDateString('tr-TR', { dateStyle: 'medium' });
const UNDO_MS = 6000;

function select<T extends string>(options: { id: T; label: string }[], value: T, label: string, cls = ''): HTMLSelectElement {
  const s = h('select', { 'aria-label': label, class: cls });
  for (const o of options) s.append(h('option', { value: o.id }, o.label));
  s.value = value;
  return s;
}

/** YouTube/Vimeo adresi video, diğerleri film varsayılır (eklentideki guessKind'e yakın). */
function guessKind(url: string): WatchKind | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ['youtube.com', 'youtu.be', 'vimeo.com'].some((x) => host === x || host.endsWith('.' + x)) ? 'video' : null;
  } catch { return null; }
}

export function watchView(): View {
  let status: '' | WatchStatus = '';
  let kind: '' | WatchKind = '';
  let editing: number | null = null;
  let items: WatchItem[] = [];
  let counts: WatchCounts = { all: 0, izlenecek: 0, izleniyor: 0, bitti: 0 };
  const pendingDeletes = new Map<number, number>();

  const status$ = h('div', { class: 'muted status', role: 'status' });
  const flash = (text: string): void => { status$.textContent = text; window.setTimeout(() => { if (status$.textContent === text) status$.textContent = ''; }, 3000); };

  // ---------- Ekleme ----------
  const addTitle = h('input', { type: 'text', class: 'grow', placeholder: 'Ne izleyeceksin? (Enter: ekle)', maxLength: 300, 'aria-label': 'Başlık' });
  const addKind = select(KINDS, 'film', 'Tür');
  const addUrl = h('input', { type: 'url', class: 'grow', placeholder: 'Bağlantı (isteğe bağlı)' });
  const addBtn = h('button', { type: 'button', class: 'primary' }, 'Ekle');
  const addForm = h('div', { class: 'card note-add' }, h('div', { class: 'note-add-input watch-add-input' }, icon('plus', 18), addTitle, addKind), h('div', { class: 'toolbar' }, addUrl, addBtn));
  addUrl.addEventListener('change', () => { const k = guessKind(addUrl.value.trim()); if (k) addKind.value = k; });

  // ---------- Süzgeçler ----------
  const tabs = h('div', { class: 'chip-tabs', role: 'tablist', 'aria-label': 'Durum' });
  const tabButtons = [{ id: '' as const, label: 'Tümü' }, ...STATUSES].map((s) => {
    const count = h('span', { class: 'tab-count' });
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(s.id === status) }, s.label, count);
    b.addEventListener('click', () => { status = s.id; tabButtons.forEach((x) => x.b.setAttribute('aria-selected', String(x.b === b))); editing = null; void refresh(); });
    tabs.append(b);
    return { id: s.id, b, count };
  });
  const kindFilter = h('select', { 'aria-label': 'Tür süzgeci' }, h('option', { value: '' }, 'Tüm türler'), ...KINDS.map((k) => h('option', { value: k.id }, k.label)));
  kindFilter.addEventListener('change', () => { kind = kindFilter.value as '' | WatchKind; void refresh(); });
  const search = h('input', { type: 'search', placeholder: 'Başlık, not veya adreste ara…', 'aria-label': 'İzleme listesinde ara' });
  const searchBox = h('label', { class: 'search-field' }, icon('search', 16), search);
  const filters = h('div', { class: 'toolbar notes-tabs' }, tabs, kindFilter);
  const newBtn = h('button', { type: 'button', class: 'primary' }, icon('plus', 16), 'Ekle');
  newBtn.addEventListener('click', () => { addForm.scrollIntoView({ block: 'nearest' }); addTitle.focus(); });

  // ---------- Silmeyi geri al ----------
  const undoBtn = h('button', { type: 'button', class: 'primary' }, 'Geri al');
  const undoBar = h('div', { class: 'card undo-bar', role: 'status', hidden: true }, h('span', {}, 'Kayıt silindi.'), undoBtn);
  let undoTarget: number | null = null;
  let undoHide: number | undefined;
  async function commitDelete(id: number): Promise<void> {
    window.clearTimeout(pendingDeletes.get(id));
    pendingDeletes.delete(id);
    if (undoTarget === id) { undoBar.hidden = true; undoTarget = null; }
    try { await api.watchDelete(id); } catch (e) { flash(errText(e)); }
    await refresh();
  }
  function scheduleDelete(id: number): void {
    pendingDeletes.set(id, window.setTimeout(() => void commitDelete(id), UNDO_MS));
    undoTarget = id;
    undoBar.hidden = false;
    window.clearTimeout(undoHide);
    undoHide = window.setTimeout(() => { undoBar.hidden = true; }, UNDO_MS);
    render();
  }
  undoBtn.addEventListener('click', () => {
    if (undoTarget === null) return;
    window.clearTimeout(pendingDeletes.get(undoTarget));
    pendingDeletes.delete(undoTarget);
    undoTarget = null;
    undoBar.hidden = true;
    flash('Silme geri alındı.');
    render();
  });
  function flushDeletes(): void { for (const id of [...pendingDeletes.keys()]) void commitDelete(id); }

  const list = h('div', { class: 'note-list' });
  const el = h('section', { class: 'watch-view' },
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('clapperboard', 26), 'İzleme listesi'),
        h('p', { class: 'page-subtitle', title: 'Eklentiyle aynı veritabanı: tarayıcıda "＋ İzle" ile eklediklerin burada, burada eklediklerin tarayıcıda görünür.' }, 'Film, dizi ve videoları tek yerde takip et.')),
      h('div', { class: 'page-actions' }, searchBox, newBtn)),
    filters, addForm, status$, list, undoBar);

  async function act(run: () => Promise<unknown>, done?: string): Promise<void> {
    try { await run(); if (done) flash(done); } catch (e) { flash(errText(e)); }
    await refresh();
  }

  async function add(): Promise<void> {
    const title = addTitle.value.trim();
    if (!title) { addTitle.focus(); return; }
    const url = addUrl.value.trim();
    addBtn.disabled = true;
    try {
      await api.watchAdd(title, addKind.value as WatchKind, url || null, null);
      addTitle.value = ''; addUrl.value = '';
      flash('Listeye eklendi.');
      await refresh();
      addTitle.focus();
    } catch (e) { flash(errText(e)); } finally { addBtn.disabled = false; }
  }

  function editor(item: WatchItem): HTMLElement {
    const title = h('input', { type: 'text', class: 'grow', maxLength: 300, 'aria-label': 'Başlık' });
    title.value = item.title;
    const k = select(KINDS, item.kind, 'Tür');
    const url = h('input', { type: 'url', class: 'grow', placeholder: 'Bağlantı (isteğe bağlı)' });
    url.value = item.url ?? '';
    const note = h('textarea', { rows: 2, class: 'grow', placeholder: 'Not (isteğe bağlı)', maxLength: 2000 });
    note.value = item.note ?? '';
    const save = h('button', { type: 'button', class: 'primary' }, 'Kaydet');
    const cancel = h('button', { type: 'button' }, 'Vazgeç');
    const doSave = async (): Promise<void> => {
      try { await api.watchUpdate(item.id, title.value, k.value as WatchKind, url.value.trim() || null, note.value.trim() || null); editing = null; flash('Kaydedildi.'); await refresh(); }
      catch (e) { flash(errText(e)); }
    };
    save.addEventListener('click', () => void doSave());
    cancel.addEventListener('click', () => { editing = null; render(); });
    const keys = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); editing = null; render(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.target !== note)) { e.preventDefault(); void doSave(); }
    };
    title.addEventListener('keydown', keys); url.addEventListener('keydown', keys); note.addEventListener('keydown', keys);
    queueMicrotask(() => title.focus());
    return h('div', { class: 'list-row note-edit' }, h('div', { class: 'list-row-content' },
      h('div', { class: 'toolbar' }, title, k), url, note, h('div', { class: 'toolbar' }, save, cancel)));
  }

  function row(item: WatchItem): HTMLElement {
    if (editing === item.id) return editor(item);
    const st = select(STATUSES, item.status, 'Durum', 'chip chip-select watch-status ' + item.status);
    st.title = 'Durumu değiştir';
    st.addEventListener('click', (e) => e.stopPropagation());
    st.addEventListener('change', () => void act(() => api.watchSetStatus(item.id, st.value as WatchStatus)));

    const content = h('div', { class: 'list-row-content' },
      h('div', { class: 'note-head' }, h('span', { class: 'chip' }, kindLabel(item.kind)), st),
      h('div', { class: 'watch-title' + (item.status === 'bitti' ? ' done' : '') }, item.title));
    if (item.note) content.append(h('div', { class: 'muted note-user' }, item.note));
    if (item.url) {
      const link = h('a', { href: item.url, class: 'note-link', title: item.url }, item.url);
      link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.noteOpenUrl(item.url!).catch((err) => flash(errText(err))); });
      content.append(h('div', { class: 'clamp-1' }, link));
    }

    const next = item.status === 'izlenecek' ? 'izleniyor' : item.status === 'izleniyor' ? 'bitti' : null;
    const nextBtn = next
      ? h('button', { type: 'button', class: 'icon-button', title: next === 'izleniyor' ? 'İzlemeye başla' : 'Bitti olarak işaretle', 'aria-label': next === 'izleniyor' ? 'İzlemeye başla' : 'Bitti olarak işaretle' }, icon(next === 'bitti' ? 'check' : 'chevron-right', 16))
      : null;
    nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); void act(() => api.watchSetStatus(item.id, next!)); });

    const menu = rowMenu([
      { label: 'Düzenle', run: () => { editing = item.id; render(); } },
      ...(item.url ? [{ label: 'Bağlantıyı aç', run: () => { api.noteOpenUrl(item.url!).catch((err) => flash(errText(err))); } }] : []),
      { label: 'Sil', danger: true, run: () => scheduleDelete(item.id) }
    ]);
    return h('div', { class: 'list-row clickable', title: 'Tıkla: düzenle', onClick: () => { if (!window.getSelection()?.toString()) { editing = item.id; render(); } } },
      h('span', { class: 'panel-row-icon watch-kind-icon' }, icon(item.kind === 'video' ? 'play' : 'clapperboard', 16)),
      content,
      h('div', { class: 'list-row-meta muted' }, fmtMs(item.updated_at)),
      h('div', { class: 'list-row-actions' }, nextBtn, menu));
  }

  function render(): void {
    for (const t of tabButtons) {
      const n = t.id === '' ? counts.all : counts[t.id];
      t.count.textContent = n ? String(n) : '';
    }
    list.replaceChildren();
    const visible = items.filter((i) => !pendingDeletes.has(i.id));
    if (!visible.length) {
      list.append(search.value || status || kind
        ? emptyState('Sonuç yok', 'Başka bir durum, tür ya da arama deneyin.')
        : emptyState('Liste boş', 'Yukarıdan ekle ya da tarayıcıda bir film/dizi/video sayfasındaki "＋ İzle" düğmesini kullan.', 'watchlist'));
      return;
    }
    for (const it of visible) list.append(row(it));
  }

  async function refresh(): Promise<void> {
    if (editing !== null) return;
    try {
      const page = await api.watchList(status, kind, search.value);
      addForm.hidden = !page.available;
      filters.hidden = !page.available;
      searchBox.hidden = !page.available;
      newBtn.hidden = !page.available;
      if (!page.available) {
        items = [];
        list.replaceChildren(emptyState('İzleme listesi henüz tarayıcıda', 'Eklentide Ayarlar → Depolama → "Verileri masaüstüne taşı" de. Sonra listeyi burada da görüp düzenleyebilirsin.'));
        return;
      }
      items = page.items;
      counts = page.counts;
      render();
    } catch (e) { flash(errText(e)); }
  }

  addBtn.addEventListener('click', () => void add());
  addTitle.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } });
  addUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } });
  search.addEventListener('input', debounce(() => void refresh(), 150));
  window.addEventListener('focus', () => { if (el.isConnected) void refresh(); });
  window.addEventListener('beforeunload', flushDeletes);

  return { el, refresh, flushDeletes } as View & { flushDeletes: () => void };
}

let instance: (View & { flushDeletes?: () => void }) | null = null;
function ensureView(): View & { flushDeletes?: () => void } {
  if (!instance) instance = watchView();
  return instance;
}

export function mount(container: HTMLElement): void {
  const v = ensureView();
  container.replaceChildren(v.el);
  void v.refresh();
}

export function unmount(): void {
  instance?.flushDeletes?.();
  instance?.el.remove();
}

export function refresh(): Promise<void> | void {
  return ensureView().refresh();
}
