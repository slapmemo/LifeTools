import { icon } from '../../../design/icons';
import '../../../shared/notes/notes.css';
import { loadNoteEditorUI } from '../../../shared/notes/lazy';
import { extractTags, renderMarkdown, toggleTaskLine } from '../../../shared/notes/render';
import type { NoteEditorHandle } from '../../../shared/notes/ui';
import { api, errText, isNoteConflict, NOTE_COLORS, type Note, type NoteCategory, type NoteCategoryInfo, type NoteColor, type NoteCounts, type NoteHistoryEntry, type NoteSort } from '../api';
import { debounce, h, type View } from '../dom';
import { emptyState, rowMenu } from '../view-components';

/** Veritabanı boşken ya da kategori listesi yüklenene kadar kullanılan yerleşik dört kategori. */
const FALLBACK_CATEGORIES: NoteCategoryInfo[] = [
  { id: 'note', label: 'Notlar', color: null, position: 0, builtin: true, created_at: 0 },
  { id: 'read', label: 'Okunacaklar', color: null, position: 1, builtin: true, created_at: 0 },
  { id: 'watch', label: 'İzlenecekler', color: null, position: 2, builtin: true, created_at: 0 },
  { id: 'idea', label: 'Fikirler', color: null, position: 3, builtin: true, created_at: 0 }
];
const COLOR_LABELS: Record<NoteColor, string> = { yellow: 'Sarı', green: 'Yeşil', blue: 'Mavi', pink: 'Pembe', purple: 'Mor' };
/** Çöpte kalma süresi (gün); backend `TRASH_DAYS` ile aynı. */
const TRASH_DAYS = 15;
const DAY_MS = 86_400_000;
const DEFAULT_CATEGORY = 'note';
const fmtMs = (ms: number): string => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const UNDO_MS = 6000;
const LONG_LINES = 8;
const LONG_CHARS = 600;

const SORTS: { id: NoteSort; label: string }[] = [
  { id: 'new', label: 'En yeni' },
  { id: 'old', label: 'En eski' },
  { id: 'updated', label: 'Son düzenlenen' },
  { id: 'manual', label: 'Elle' }
];

function readPref(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* yoksay */ } }

function categorySelect(list: NoteCategoryInfo[], value: NoteCategory, cls = ''): HTMLSelectElement {
  const select = h('select', { 'aria-label': 'Kategori', class: cls });
  fillCategoryOptions(select, list, value);
  return select;
}
function fillCategoryOptions(select: HTMLSelectElement, list: NoteCategoryInfo[], value: NoteCategory): void {
  select.replaceChildren(...list.map((c) => h('option', { value: c.id }, c.label)));
  // Listede olmayan (silinmiş) kategori görünürse yine de seçili kalsın.
  if (!list.some((c) => c.id === value)) select.append(h('option', { value }, value));
  select.value = value;
}
function colorSelect(value: string | null): HTMLSelectElement {
  const select = h('select', { 'aria-label': 'Renk' });
  select.append(h('option', { value: '' }, 'Renksiz'), ...NOTE_COLORS.map((c) => h('option', { value: c }, COLOR_LABELS[c])));
  select.value = value ?? '';
  return select;
}

/** Ortada açılan basit pencere; `close()` döndürür. Esc ve dışarı tıklama kapatır. */
function openDialog(title: string, body: HTMLElement, wide = false): () => void {
  const closeBtn = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Kapat', title: 'Kapat' }, icon('x', 16));
  const box = h('div', { class: 'card dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'dialog-head' }, h('h3', { class: 'dialog-title' }, title), closeBtn), body);
  const overlay = h('div', { class: 'dialog-overlay' }, box);
  const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const close = (): void => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  return close;
}

/** `datetime-local` değeri (yerel saat) ↔ milisaniye. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function at(daysFromToday: number, hour: number): number {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

/** '' = Tümü, 'archive', 'trash' ya da bir kategori kimliği. */
type Tab = string;

export function notesView(): View {
  let tab: Tab = '';
  let sort: NoteSort = (SORTS.find((s) => s.id === readPref('lifetools_notes_sort'))?.id) ?? 'new';
  let showDone = readPref('lifetools_notes_show_done') !== '0';
  let editing: number | null = null;
  let reminding: number | null = null;
  let notes: Note[] = [];
  let counts: NoteCounts = { all: 0, note: 0, read: 0, watch: 0, idea: 0, archived: 0, trash: 0, by_category: {} };
  let categories: NoteCategoryInfo[] = FALLBACK_CATEGORIES;
  let coloring: number | null = null;
  const pendingDeletes = new Map<number, number>();
  const expandedPages = new Set<number>();
  const expandedBodies = new Set<number>();
  const pageCache = new Map<number, { text: string; saved_at: number }>();
  const imageCache = new Map<number, string>();

  const status = h('div', { class: 'muted status', role: 'status' });
  const flash = (text: string, ms = 3000): void => { status.textContent = text; window.setTimeout(() => { if (status.textContent === text) status.textContent = ''; }, ms); };

  // ---------- Sekmeler (sayılı) ----------
  const tabs = h('div', { class: 'chip-tabs', role: 'tablist', 'aria-label': 'Kategori' });
  let tabButtons: { id: Tab; b: HTMLButtonElement; count: HTMLElement }[] = [];
  function renderTabs(): void {
    const defs: { id: Tab; label: string }[] = [{ id: '', label: 'Tümü' }, ...categories.map((c) => ({ id: c.id, label: c.label })), { id: 'archive', label: 'Arşiv' }, { id: 'trash', label: 'Çöp kutusu' }];
    if (tab && !defs.some((d) => d.id === tab)) tab = '';
    tabButtons = defs.map((c) => {
      const count = h('span', { class: 'tab-count' });
      const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(c.id === tab) }, c.label, count);
      b.addEventListener('click', () => {
        tab = c.id;
        tabButtons.forEach((x) => x.b.setAttribute('aria-selected', String(x.b === b)));
        if (c.id && c.id !== 'archive' && c.id !== 'trash') addCategory.value = c.id;
        editing = null; reminding = null; coloring = null;
        void refresh();
      });
      return { id: c.id, b, count };
    });
    tabs.replaceChildren(...tabButtons.map((t) => t.b));
    renderCounts();
  }
  function renderCounts(): void {
    for (const t of tabButtons) {
      const n = t.id === '' ? counts.all : t.id === 'archive' ? counts.archived : t.id === 'trash' ? counts.trash : (counts.by_category[t.id] ?? 0);
      t.count.textContent = n ? String(n) : '';
    }
  }
  const catBtn = h('button', { type: 'button', class: 'icon-button', title: 'Kategorileri yönet', 'aria-label': 'Kategorileri yönet' }, icon('settings', 16));
  catBtn.addEventListener('click', () => openCategoryManager());

  const search = h('input', { type: 'search', placeholder: 'Notlarda ara… (Ctrl+K)', 'aria-label': 'Notlarda ara (#etiket de olur)' });
  const searchBox = h('label', { class: 'search-field' }, icon('search', 16), search);
  const countLabel = h('span', { class: 'muted notes-count' });

  // ---------- Sıralama, tamamlananlar, etiketler ----------
  const sortSelect = h('select', { 'aria-label': 'Sıralama' });
  for (const s of SORTS) sortSelect.append(h('option', { value: s.id }, s.label));
  sortSelect.value = sort;
  sortSelect.addEventListener('change', () => { sort = sortSelect.value as NoteSort; writePref('lifetools_notes_sort', sort); void refresh(); });
  const showDoneBox = h('input', { type: 'checkbox', checked: showDone });
  showDoneBox.addEventListener('change', () => { showDone = showDoneBox.checked; writePref('lifetools_notes_show_done', showDone ? '1' : '0'); void refresh(); });
  const showDoneLabel = h('label', { class: 'notes-check' }, showDoneBox, 'Tamamlananları göster');
  const tagBar = h('div', { class: 'tag-bar' });
  const filterBar = h('div', { class: 'toolbar notes-filters' }, showDoneLabel, tagBar, countLabel);

  // ---------- Hızlı ekleme ----------
  const ADD_DRAFT_KEY = 'lifetools_notes_draft';
  const addHost = h('div', { class: 'note-add-editor' });
  const addCategory = categorySelect(categories, DEFAULT_CATEGORY);
  const addUrl = h('input', { type: 'url', class: 'grow', placeholder: 'Bağlantı (isteğe bağlı)' });
  const addBtn = h('button', { type: 'button', class: 'primary' }, 'Ekle');
  const addForm = h('div', { class: 'card note-add' }, h('div', { class: 'note-add-input' }, icon('pencil', 18), addHost), h('div', { class: 'toolbar' }, addCategory, addUrl, addBtn));

  // Düzenleyici (TipTap) ilk odakta yüklenir; o zamana kadar hafif bir yer tutucu görünür.
  let addEditor: NoteEditorHandle | null = null;
  let addLoading: Promise<NoteEditorHandle | null> | null = null;
  const addPlaceholder = h('div', { class: 'note-add-ph', tabindex: 0, role: 'textbox', 'aria-label': 'Yeni not' }, 'Yeni not… (Ctrl+Enter: ekle · Markdown ve biçim çubuğu kullanılabilir)');
  addHost.append(addPlaceholder);
  function loadAddEditor(focus: boolean): Promise<NoteEditorHandle | null> {
    if (addEditor) { if (focus) addEditor.focus(); return Promise.resolve(addEditor); }
    addLoading ??= loadNoteEditorUI().then(({ mountNoteEditor }) => {
      addHost.replaceChildren();
      addEditor = mountNoteEditor(addHost, {
        placeholder: 'Yeni not… (Ctrl+Enter: ekle · Markdown: **kalın**, - [ ] yapılacak, #etiket)',
        draftKey: ADD_DRAFT_KEY,
        onFocusMode: setFocusClass
      });
      return addEditor;
    }).catch((e) => { flash(errText(e)); addLoading = null; return null; });
    return addLoading.then((ed) => { if (focus) ed?.focus(); return ed; });
  }
  addPlaceholder.addEventListener('focus', () => void loadAddEditor(true));
  addPlaceholder.addEventListener('click', () => void loadAddEditor(true));
  // Kayıtlı taslak varsa düzenleyiciyi hemen yükle ki taslak görünsün.
  try { if ((localStorage.getItem(ADD_DRAFT_KEY) ?? '').trim()) void loadAddEditor(false); } catch { /* yoksay */ }
  // Ctrl+Enter: ekle (düzenleyici tuşu görmeden yakala).
  addHost.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); void add(); }
  }, true);

  function setFocusClass(on: boolean): void { document.body.classList.toggle('notes-focus', on); }

  // ---------- Silmeyi geri al ----------
  const undoText = h('span', {}, 'Not çöp kutusuna taşındı.');
  const undoBtn = h('button', { type: 'button', class: 'primary' }, 'Geri al');
  const undoBar = h('div', { class: 'card undo-bar', role: 'status', hidden: true }, undoText, undoBtn);
  let undoTarget: number | null = null;
  let undoHide: number | undefined;

  async function commitDelete(id: number): Promise<void> {
    window.clearTimeout(pendingDeletes.get(id));
    pendingDeletes.delete(id);
    if (undoTarget === id) { undoBar.hidden = true; undoTarget = null; }
    try { await api.noteDelete(id); } catch (e) { flash(errText(e)); await refresh(); }
  }
  function scheduleDelete(id: number): void {
    pendingDeletes.set(id, window.setTimeout(() => void commitDelete(id), UNDO_MS));
    undoTarget = id;
    undoBar.hidden = false;
    window.clearTimeout(undoHide);
    undoHide = window.setTimeout(() => { undoBar.hidden = true; }, UNDO_MS);
    notes = notes.filter((n) => n.id !== id);
    render();
  }
  undoBtn.addEventListener('click', () => {
    if (undoTarget === null) return;
    const id = undoTarget;
    undoTarget = null;
    undoBar.hidden = true;
    if (pendingDeletes.has(id)) {
      // Silme henüz uygulanmadı: yalnız iptal et.
      window.clearTimeout(pendingDeletes.get(id));
      pendingDeletes.delete(id);
      flash('Silme geri alındı.');
      void refresh();
    } else {
      // Silme çöpe taşındı: çöpten geri yükle.
      void act(() => api.noteRestore(id), 'Silme geri alındı.');
    }
  });
  /** Bekleyen silmeleri hemen uygular (görünümden çıkarken). */
  function flushDeletes(): void {
    for (const id of [...pendingDeletes.keys()]) void commitDelete(id);
    // Görünümden çıkarken açık düzenleyiciyi kaydet ve kapat.
    if (activeEdit) { const a = activeEdit; activeEdit = null; editing = null; void disposeEdit(a); }
    addEditor?.flush().catch(() => undefined);
  }

  const list = h('div', { class: 'note-list' });
  const newBtn = h('button', { type: 'button', class: 'primary' }, icon('plus', 16), 'Yeni not');
  newBtn.addEventListener('click', () => { addForm.scrollIntoView({ block: 'nearest' }); void loadAddEditor(true); });
  const el = h('section', { class: 'notes-view' },
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('notebook-pen', 26), 'Notlar'),
        h('p', { class: 'page-subtitle', title: 'Eklentiyle aynı veritabanı: burada eklediğin not tarayıcıda, tarayıcıda eklediğin not burada görünür.' }, 'Hızlı notlar al, etiketle ve her yerden ulaş.')),
      h('div', { class: 'page-actions' }, searchBox, newBtn)),
    h('div', { class: 'toolbar notes-tabs' }, h('div', { class: 'notes-tabs-main' }, tabs, catBtn), sortSelect),
    addForm,
    filterBar,
    status,
    list,
    undoBar
  );

  async function add(): Promise<void> {
    const ed = await loadAddEditor(false);
    if (!ed) return;
    const text = ed.getMarkdown().trim();
    if (!text) { ed.focus(); return; }
    const url = addUrl.value.trim();
    if (url && !/^https?:\/\//i.test(url)) { flash('Bağlantı http:// veya https:// ile başlamalı.'); addUrl.focus(); return; }
    addBtn.disabled = true;
    try {
      await api.noteAdd(addCategory.value as NoteCategory, text, url || null, null);
      ed.setMarkdown('');
      ed.clearDraft();
      addUrl.value = '';
      flash('Not eklendi.');
      await refresh();
      ed.focus();
    } catch (e) { flash(errText(e)); } finally { addBtn.disabled = false; }
  }

  /** Tek bir işlemi çalıştırır, hata olursa gösterir, sonra listeyi yeniler. */
  async function act(run: () => Promise<unknown>, done?: string): Promise<void> {
    try { await run(); if (done) flash(done); } catch (e) { flash(errText(e)); }
    await refresh();
  }

  function setTagFilter(tag: string): void {
    search.value = search.value.trim().toLocaleLowerCase('tr-TR') === tag ? '' : tag;
    void refresh();
  }

  // ---------- Düzenleyici (satır içi, otomatik kaydetme) ----------
  interface ActiveEdit { id: number; wrapper: HTMLElement; finish: () => Promise<boolean>; dispose: () => void; closing: boolean }
  let activeEdit: ActiveEdit | null = null;

  /** Açık düzenleyiciyi kaydedip kapatır; kayıt başarısızsa (ör. çakışma) açık bırakır. */
  async function closeEdit(): Promise<void> {
    const a = activeEdit;
    if (!a || a.closing) return;
    a.closing = true;
    const ok = await a.finish();
    a.closing = false;
    if (!ok || activeEdit !== a) return;
    a.dispose();
    activeEdit = null;
    if (editing === a.id) editing = null;
    await refresh();
  }

  /** Düzenleyiciyi sessizce atmaz: kayıt başarısızsa metin kurtarma kaydına yazılır (destroy) ve kullanıcıya söylenir. */
  async function disposeEdit(a: ActiveEdit): Promise<void> {
    let ok = false;
    try { ok = await a.finish(); } catch { ok = false; }
    a.dispose();
    if (!ok) flash('Kaydedilemeyen değişiklik saklandı — Geri yükle (notu yeniden açınca çıkar)', 8000);
  }

  function editor(note: Note): HTMLElement {
    if (activeEdit?.id === note.id) return activeEdit.wrapper;
    let expected = note.updated_at;
    let savedUserNote = note.user_note ?? '';
    let handle: NoteEditorHandle | null = null;
    let disposed = false;
    const host = h('div', { class: 'note-edit-wrap' }, h('span', { class: 'muted' }, 'Düzenleyici yükleniyor…'));
    const userNote = h('input', { type: 'text', class: 'grow', placeholder: 'Notum (isteğe bağlı açıklama)' });
    userNote.value = savedUserNote;
    const category = categorySelect(categories, note.category);

    // Kayıtlar sıraya girer: kategori / "notum" değişikliği updated_at'i değiştirir, otomatik kayıtla yarışmasın.
    let chain: Promise<unknown> = Promise.resolve();
    const serial = <T>(fn: () => Promise<T>): Promise<T> => { const p = chain.then(fn); chain = p.catch(() => undefined); return p; };
    const syncExpected = async (): Promise<void> => { const fresh = await api.noteGet(note.id); if (fresh) expected = fresh.updated_at; };

    category.addEventListener('change', () => void serial(async () => {
      try { await api.noteSetCategory(note.id, category.value as NoteCategory); await syncExpected(); } catch (e) { flash(errText(e)); }
    }));
    const saveUserNote = (): Promise<void> => serial(async () => {
      const v = userNote.value.trim();
      if (v === savedUserNote) return;
      await api.noteSetUserNote(note.id, v || null);
      savedUserNote = v;
      await syncExpected();
    });
    userNote.addEventListener('change', () => void saveUserNote().catch((e) => flash(errText(e))));

    const wrapper = h('div', { class: 'list-row note-edit' }, h('div', { class: 'list-row-content' },
      host,
      h('div', { class: 'toolbar' }, category, userNote),
      h('p', { class: 'hint note-saved-hint' }, 'Kendiliğinden kaydedilir · Esc: kapat · Ctrl+F: bul · Ctrl+H: değiştir')));

    const finish = async (): Promise<boolean> => {
      try { await saveUserNote(); } catch (e) { flash(errText(e)); return false; }
      return handle ? await handle.flush() : true;
    };
    const onOutside = (e: Event): void => {
      const t = e.target as Node | null;
      if (!t || wrapper.contains(t) || !t.isConnected) return;
      if ((t as Element).closest?.('.ctx-menu, .bubble, .lightbox, .dialog-overlay')) return;
      void closeEdit();
    };
    document.addEventListener('pointerdown', onOutside, true);
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); void closeEdit(); }
    });
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('pointerdown', onOutside, true);
      if (handle?.isFocusMode()) handle.setFocusMode(false);
      handle?.destroy();
      setFocusClass(false);
    };
    const self: ActiveEdit = {
      id: note.id, wrapper, finish, dispose, closing: false
    };
    activeEdit = self;

    void loadNoteEditorUI().then(({ mountNoteEditor, NoteConflictError }) => {
      if (disposed || activeEdit !== self) return;
      host.replaceChildren();
      handle = mountNoteEditor(host, {
        markdown: note.text,
        autosave: true,
        // Kayıt başarısız / çakışmalıysa ve düzenleyici yine de kapanırsa metin burada saklanır; açılışta "Geri yükle" çıkar.
        recoveryKey: `lifetools_note_recovery_${note.id}`,
        onFocusMode: setFocusClass,
        onSave: (md, ctx) => serial(async () => {
          try { expected = await api.noteSetText(note.id, md, ctx.force ? null : expected); }
          catch (e) { if (isNoteConflict(e)) throw new NoteConflictError(); throw new Error(errText(e)); }
        }),
        onConflict: async (choice) => {
          if (choice !== 'reload') return;
          const fresh = await api.noteGet(note.id);
          if (!fresh) { flash('Not artık yok.'); return; }
          expected = fresh.updated_at;
          note.text = fresh.text;
          handle?.setMarkdown(fresh.text);
        }
      });
      handle.focus();
    }).catch((e) => { host.replaceChildren(h('span', { class: 'muted' }, errText(e))); });
    return wrapper;
  }

  function reminderEditor(note: Note): HTMLElement {
    const input = h('input', { type: 'datetime-local', 'aria-label': 'Hatırlatma zamanı' });
    input.value = toLocalInput(note.remind_at ?? at(1, 9));
    const set = async (ms: number): Promise<void> => {
      if (!Number.isFinite(ms)) { flash('Geçerli bir tarih seç.'); return; }
      if (ms <= Date.now()) { flash('Hatırlatma ileri bir zaman olmalı.'); return; }
      reminding = null;
      await act(() => api.noteSetReminder(note.id, ms), `Hatırlatma: ${fmtMs(ms)}`);
    };
    const preset = (label: string, ms: () => number): HTMLButtonElement => {
      const b = h('button', { type: 'button' }, label);
      b.addEventListener('click', () => void set(ms()));
      return b;
    };
    const evening = (): number => { const t = at(0, 20); return t > Date.now() ? t : at(1, 20); };
    const ok = h('button', { type: 'button', class: 'primary' }, 'Kur');
    ok.addEventListener('click', () => void set(new Date(input.value).getTime()));
    const cancel = h('button', { type: 'button' }, 'Vazgeç');
    cancel.addEventListener('click', () => { reminding = null; render(); });
    const box = h('div', { class: 'reminder-editor', onClick: (e: Event) => e.stopPropagation() },
      h('div', { class: 'toolbar' },
        preset('1 saat sonra', () => Date.now() + 3600_000),
        preset('Bu akşam 20:00', evening),
        preset('Yarın 09:00', () => at(1, 9)),
        preset('Haftaya', () => at(7, 9))),
      h('div', { class: 'toolbar' }, input, ok, cancel));
    if (note.remind_at) {
      const remove = h('button', { type: 'button', class: 'danger' }, 'Kaldır');
      remove.addEventListener('click', () => { reminding = null; void act(() => api.noteSetReminder(note.id, null), 'Hatırlatma kaldırıldı.'); });
      box.lastElementChild!.append(remove);
    }
    queueMicrotask(() => input.focus());
    return box;
  }

  // ---------- Ekler ----------
  function openImage(src: string): void {
    const overlay = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Görsel' }, h('img', { src, alt: '' }));
    const close = (): void => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
  }

  function imageThumb(note: Note): HTMLElement {
    const img = h('img', { class: 'note-thumb', alt: 'Kaydedilen görsel', loading: 'lazy' });
    const show = (src: string): void => { img.src = src; };
    const cached = imageCache.get(note.id);
    if (cached) show(cached);
    else api.noteImage(note.id).then((src) => { if (src) { imageCache.set(note.id, src); show(src); } else img.remove(); }).catch(() => img.remove());
    img.addEventListener('click', (e) => { e.stopPropagation(); if (img.src) openImage(img.src); });
    return img;
  }

  function pagePanel(note: Note): HTMLElement {
    const box = h('div', { class: 'note-page', onClick: (e: Event) => e.stopPropagation() }, h('span', { class: 'muted' }, 'Yükleniyor…'));
    const fill = (p: { text: string; saved_at: number } | null): void => {
      box.replaceChildren(p
        ? h('div', {}, h('div', { class: 'hint' }, `Sayfa ${fmtMs(p.saved_at)} tarihinde kaydedildi`), h('div', { class: 'note-page-text' }, p.text))
        : h('span', { class: 'muted' }, 'Kaydedilmiş sayfa bulunamadı.'));
    };
    const cached = pageCache.get(note.id);
    if (cached) fill(cached);
    else api.notePage(note.id).then((p) => { if (p) pageCache.set(note.id, p); fill(p); }).catch((e) => { fill(null); flash(errText(e)); });
    return box;
  }

  // ---------- Satır ----------
  function noteRow(note: Note): HTMLElement {
    if (editing === note.id) return editor(note);
    const done = note.done_at !== null;
    const archived = note.archived_at !== null;

    const doneBtn = h('button', {
      type: 'button', class: 'done-toggle' + (done ? ' on' : ''),
      title: done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle',
      'aria-label': done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle', 'aria-pressed': String(done)
    }, icon('check', 14));
    doneBtn.addEventListener('click', (e) => { e.stopPropagation(); void act(() => api.noteSetDone(note.id, !done)); });

    const cat = categorySelect(categories, note.category, 'chip chip-select');
    const catInfo = categories.find((c) => c.id === note.category);
    if (catInfo?.color) cat.dataset.color = catInfo.color;
    cat.title = 'Kategoriyi değiştir';
    cat.addEventListener('click', (e) => e.stopPropagation());
    cat.addEventListener('change', () => void act(() => api.noteSetCategory(note.id, cat.value as NoteCategory)));

    const head = h('div', { class: 'note-head' }, cat);
    if (note.pinned && !archived) head.append(h('span', { class: 'note-flag', title: 'Sabitlendi' }, icon('pin', 13)));
    if (note.remind_at) {
      const past = note.remind_at <= Date.now();
      const chip = h('button', { type: 'button', class: 'chip reminder-chip' + (past ? ' past' : ''), title: 'Hatırlatmayı değiştir' }, icon('bell', 12), fmtMs(note.remind_at));
      chip.addEventListener('click', (e) => { e.stopPropagation(); reminding = reminding === note.id ? null : note.id; render(); });
      head.append(chip);
    }

    const long = note.text.split('\n').length > LONG_LINES || note.text.length > LONG_CHARS;
    const expanded = expandedBodies.has(note.id);
    const body = renderMarkdown(note.text, {
      onToggleTask: (line, checked) => {
        const next = toggleTaskLine(note.text, line, checked);
        if (next !== note.text) void act(() => api.noteSetText(note.id, next));
      },
      onOpenUrl: (url) => { api.noteOpenUrl(url).catch((err) => flash(errText(err))); },
      onTag: setTagFilter
    });
    body.classList.add('note-body');
    if (long && !expanded) body.classList.add('collapsed');

    const content = h('div', { class: 'list-row-content' }, head, body);
    if (long) {
      const more = h('button', { type: 'button', class: 'link-button' }, expanded ? 'Daha az göster' : 'Devamını göster');
      more.addEventListener('click', (e) => { e.stopPropagation(); if (expanded) expandedBodies.delete(note.id); else expandedBodies.add(note.id); render(); });
      content.append(more);
    }
    if (note.user_note) content.append(h('div', { class: 'muted note-user' }, '📝 ' + note.user_note));
    if (note.url) {
      const link = h('a', { href: note.url, class: 'note-link', title: note.url }, note.page_title || note.url);
      link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.noteOpenUrl(note.url!).catch((err) => flash(errText(err))); });
      content.append(h('div', { class: 'clamp-1' }, link));
    }
    if (note.has_image) content.append(imageThumb(note));
    if (note.has_page) {
      const open = expandedPages.has(note.id);
      const pageBtn = h('button', { type: 'button', class: 'chip page-chip', 'aria-expanded': String(open) }, icon('file-text', 12), open ? 'Kaydedilmiş sayfayı gizle' : 'Kaydedilmiş sayfa');
      pageBtn.addEventListener('click', (e) => { e.stopPropagation(); if (open) expandedPages.delete(note.id); else expandedPages.add(note.id); render(); });
      content.append(h('div', {}, pageBtn));
      if (open) content.append(pagePanel(note));
    }
    if (reminding === note.id) content.append(reminderEditor(note));
    if (coloring === note.id) content.append(colorPicker(note));

    const copyBtn = h('button', { type: 'button', class: 'icon-button', title: 'Metni kopyala', 'aria-label': 'Metni kopyala' }, icon('copy', 16));
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await navigator.clipboard.writeText(note.url ? `${note.text}\n${note.url}` : note.text); flash('Panoya kopyalandı.'); } catch (err) { flash(errText(err)); }
    });

    const menu = rowMenu([
      { label: 'Düzenle', run: () => { editing = note.id; reminding = null; render(); } },
      ...(archived ? [] : [{ label: note.pinned ? 'Sabitlemeyi kaldır' : 'Sabitle', run: () => act(() => api.noteSetPinned(note.id, !note.pinned)) }]),
      { label: done ? 'Tamamlanmadı yap' : 'Tamamlandı', run: () => act(() => api.noteSetDone(note.id, !done)) },
      { label: note.remind_at ? 'Hatırlatmayı değiştir…' : 'Hatırlat…', run: () => { reminding = note.id; render(); } },
      { label: archived ? 'Arşivden çıkar' : 'Arşivle', run: () => act(() => api.noteSetArchived(note.id, !archived), archived ? 'Arşivden çıkarıldı.' : 'Arşivlendi.') },
      ...(sort === 'manual' && !archived ? [
        { label: 'Yukarı taşı', run: () => moveBy(note, -1) },
        { label: 'Aşağı taşı', run: () => moveBy(note, 1) }
      ] : []),
      { label: 'Renk…', run: () => { coloring = coloring === note.id ? null : note.id; render(); } },
      { label: 'Geçmiş…', run: () => openHistory(note) },
      { label: 'Çoğalt', run: () => act(() => api.noteDuplicate(note.id), 'Not çoğaltıldı.') },
      { label: 'Sil', danger: true, run: () => scheduleDelete(note.id) }
    ]);

    const editOnClick = (): void => {
      if (window.getSelection()?.toString()) return; // metin seçiliyorsa düzenlemeye geçme
      editing = note.id; reminding = null; render();
    };
    const manual = sort === 'manual' && !archived;
    const grip = manual ? h('span', { class: 'drag-grip', title: 'Sürükleyerek sırala', 'aria-label': 'Sürükleyerek sırala', role: 'button', tabindex: -1 }, '⋮⋮') : null;
    const row = h('div', { class: 'list-row clickable note-row' + (done ? ' done' : '') + (note.pinned && !archived ? ' pinned' : '') + (note.color ? ' has-color' : ''), title: 'Tıkla: düzenle', 'data-id': String(note.id), onClick: editOnClick },
      h('div', { class: 'list-row-leading' }, grip, doneBtn),
      content,
      h('div', { class: 'list-row-meta muted' }, fmtMs(note.created_at)),
      h('div', { class: 'list-row-actions' }, copyBtn, menu));
    if (note.color) row.dataset.color = note.color;
    if (manual) {
      row.tabIndex = 0;
      row.addEventListener('keydown', (e) => {
        if (e.target !== row || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        void moveBy(note, e.key === 'ArrowUp' ? -1 : 1);
      });
    }
    if (grip) bindDrag(grip, row, note);
    return row;
  }

  function colorPicker(note: Note): HTMLElement {
    const box = h('div', { class: 'color-picker toolbar', role: 'group', 'aria-label': 'Not rengi', onClick: (e: Event) => e.stopPropagation() });
    const pick = (c: NoteColor | null): void => { coloring = null; void act(() => api.noteSetColor(note.id, c), c ? 'Renk değişti.' : 'Renk kaldırıldı.'); };
    for (const c of NOTE_COLORS) {
      const b = h('button', { type: 'button', class: 'color-swatch' + (note.color === c ? ' on' : ''), title: COLOR_LABELS[c], 'aria-label': COLOR_LABELS[c], 'data-color': c });
      b.addEventListener('click', () => pick(c));
      box.append(b);
    }
    const none = h('button', { type: 'button' }, 'Renksiz');
    none.addEventListener('click', () => pick(null));
    const cancel = h('button', { type: 'button' }, 'Vazgeç');
    cancel.addEventListener('click', () => { coloring = null; render(); });
    box.append(none, cancel);
    return box;
  }

  // ---------- Elle sıralama (fare/dokunma ile; HTML5 sürükle-bırak Tauri'de güvenilir değil) ----------
  function bindDrag(grip: HTMLElement, row: HTMLElement, note: Note): void {
    grip.addEventListener('click', (e) => e.stopPropagation());
    grip.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      row.classList.add('dragging');
      let target: HTMLElement | null = null;
      let after = false;
      const clearMarks = (): void => list.querySelectorAll('.drop-before, .drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after'));
      const move = (ev: PointerEvent): void => {
        clearMarks();
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('.note-row[data-id]') ?? null;
        target = under && under !== row ? under : null;
        if (!target) return;
        const r = target.getBoundingClientRect();
        after = ev.clientY > r.top + r.height / 2;
        target.classList.add(after ? 'drop-after' : 'drop-before');
      };
      const up = (): void => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        row.classList.remove('dragging');
        clearMarks();
        if (target) void reorderTo(note, Number(target.dataset.id), after);
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }

  /** Klavye / menü ile bir satır yukarı ya da aşağı (aynı sabit grubunda komşu satırla). */
  async function moveBy(note: Note, delta: -1 | 1): Promise<void> {
    const visible = notes.filter((n) => !pendingDeletes.has(n.id));
    let i = visible.findIndex((n) => n.id === note.id) + delta;
    while (i >= 0 && i < visible.length && visible[i].pinned !== note.pinned) i += delta;
    const neighbor = visible[i];
    if (!neighbor) return;
    await reorderTo(note, neighbor.id, delta > 0);
    list.querySelector<HTMLElement>(`.note-row[data-id="${note.id}"]`)?.focus();
  }

  async function reorderTo(moved: Note, targetId: number, after: boolean): Promise<void> {
    const target = notes.find((n) => n.id === targetId);
    // Sabitlenenler hep üstte kalır: sabit ile sabit olmayan arasında sıra değişmez.
    if (!target || target.pinned !== moved.pinned) { flash('Sabitlenmiş notlar üstte kalır; yalnız kendi grubunda sıralanır.'); return; }
    const without = notes.filter((n) => n.id !== moved.id);
    const pos = without.findIndex((n) => n.id === targetId) + (after ? 1 : 0);
    without.splice(pos, 0, moved);
    notes = without;
    render();
    try { await api.noteReorder(notes.map((n) => n.id), tab && tab !== 'archive' && tab !== 'trash' ? tab : null); } catch (e) { flash(errText(e)); await refresh(); }
  }

  // ---------- Çöp kutusu ----------
  function daysLeft(note: Note): number {
    return Math.max(0, TRASH_DAYS - Math.floor((Date.now() - (note.deleted_at ?? Date.now())) / DAY_MS));
  }

  function trashRow(note: Note): HTMLElement {
    const left = daysLeft(note);
    const body = renderMarkdown(note.text, {});
    body.classList.add('note-body', 'collapsed');
    const restore = h('button', { type: 'button' }, 'Geri yükle');
    restore.addEventListener('click', () => void act(() => api.noteRestore(note.id), 'Not geri yüklendi.'));
    const purge = h('button', { type: 'button', class: 'danger' }, 'Kalıcı sil');
    let timer: number | undefined;
    purge.addEventListener('click', () => {
      if (timer === undefined) {
        purge.textContent = 'Emin misin?';
        timer = window.setTimeout(() => { timer = undefined; purge.textContent = 'Kalıcı sil'; }, 3000);
        return;
      }
      window.clearTimeout(timer);
      void act(() => api.notePurge(note.id), 'Not kalıcı olarak silindi.');
    });
    const catLabel = categories.find((c) => c.id === note.category)?.label ?? note.category;
    return h('div', { class: 'list-row note-row trash-row' },
      h('div', { class: 'list-row-content' },
        h('div', { class: 'note-head' }, h('span', { class: 'chip' }, catLabel), h('span', { class: 'muted trash-left' }, left > 0 ? `${left} gün sonra kalıcı olarak silinecek` : 'Bugün kalıcı olarak silinecek')),
        body),
      h('div', { class: 'list-row-actions trash-actions' }, restore, purge));
  }

  function trashBar(n: number): HTMLElement {
    const bar = h('div', { class: 'card trash-bar' });
    const idle = (): void => {
      const btn = h('button', { type: 'button', class: 'danger' }, 'Çöpü boşalt');
      btn.addEventListener('click', ask);
      bar.replaceChildren(h('span', { class: 'muted' }, `Çöpteki notlar ${TRASH_DAYS} gün sonra kalıcı olarak silinir.`), btn);
    };
    const ask = (): void => {
      const yes = h('button', { type: 'button', class: 'danger' }, 'Evet, boşalt');
      const no = h('button', { type: 'button' }, 'Vazgeç');
      yes.addEventListener('click', () => void act(async () => { await api.noteTrashEmpty(); }, 'Çöp boşaltıldı.'));
      no.addEventListener('click', idle);
      bar.replaceChildren(h('span', {}, `${n} not kalıcı olarak silinecek. Bu geri alınamaz.`), yes, no);
      yes.focus();
    };
    idle();
    return bar;
  }

  // ---------- Geçmiş ----------
  async function openHistory(note: Note): Promise<void> {
    let entries: NoteHistoryEntry[];
    try { entries = await api.noteHistory(note.id); } catch (e) { flash(errText(e)); return; }
    const body = h('div', { class: 'history' });
    let close: () => void = () => undefined;
    if (!entries.length) {
      body.append(h('p', { class: 'muted' }, 'Bu not için kayıtlı geçmiş yok. Not değiştikçe önceki hâller burada birikir.'));
    } else {
      const listBox = h('div', { class: 'history-list', role: 'listbox', 'aria-label': 'Kayıtlı hâller' });
      const preview = h('div', { class: 'history-preview' });
      const restore = h('button', { type: 'button', class: 'primary' }, 'Bu hâle dön');
      let selected = entries[0];
      const show = (entry: NoteHistoryEntry): void => {
        selected = entry;
        listBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === String(entry.id))));
        preview.replaceChildren(renderMarkdown(entry.text, {}));
      };
      for (const e of entries) {
        const b = h('button', { type: 'button', role: 'option', class: 'history-item', 'data-id': String(e.id) }, fmtMs(e.saved_at));
        b.addEventListener('click', () => show(e));
        listBox.append(b);
      }
      restore.addEventListener('click', () => {
        close();
        void act(() => api.noteHistoryRestore(selected.id), 'Önceki hâle dönüldü.');
      });
      body.append(listBox, h('div', { class: 'history-side' }, preview, h('div', { class: 'toolbar' }, restore, h('span', { class: 'hint' }, 'Dönmeden önceki hâl de geçmişe yazılır.'))));
      show(entries[0]);
    }
    close = openDialog('Geçmiş', body, true);
  }

  // ---------- Kategori yönetimi ----------
  function openCategoryManager(): void {
    const body = h('div', { class: 'cat-mgr' });
    const msg = h('div', { class: 'hint', role: 'alert' });
    const listBox = h('div', { class: 'cat-list' });
    let confirming: string | null = null;
    let confirmCount = 0;

    /** Kategoriler değişti: listeyi, sekmeleri ve notları yenile. */
    async function reload(): Promise<void> {
      categories = await api.noteCategories();
      fillCategoryOptions(addCategory, categories, categories.some((c) => c.id === addCategory.value) ? addCategory.value : DEFAULT_CATEGORY);
      renderTabs();
      draw();
      void refresh();
    }
    const run = async (fn: () => Promise<unknown>): Promise<void> => {
      msg.textContent = '';
      try { await fn(); await reload(); } catch (e) { msg.textContent = errText(e); }
    };

    function draw(): void {
      listBox.replaceChildren(...categories.map((c, i) => {
        const dot = colorSelect(c.color);
        dot.addEventListener('change', () => void run(() => api.noteCategoryRecolor(c.id, dot.value || null)));
        const name = h('input', { type: 'text', class: 'grow', maxLength: 40, 'aria-label': 'Kategori adı' });
        name.value = c.label;
        name.addEventListener('change', () => {
          if (!name.value.trim()) { name.value = c.label; return; }
          void run(() => api.noteCategoryRename(c.id, name.value));
        });
        const swap = (to: number): void => {
          const ids = categories.map((x) => x.id);
          [ids[i], ids[to]] = [ids[to], ids[i]];
          void run(() => api.noteCategoriesReorder(ids));
        };
        const up = h('button', { type: 'button', class: 'icon-button', title: 'Yukarı taşı', 'aria-label': 'Yukarı taşı', disabled: i === 0 }, '↑');
        const down = h('button', { type: 'button', class: 'icon-button', title: 'Aşağı taşı', 'aria-label': 'Aşağı taşı', disabled: i === categories.length - 1 }, '↓');
        up.addEventListener('click', () => swap(i - 1));
        down.addEventListener('click', () => swap(i + 1));
        const row = h('div', { class: 'cat-row' }, dot, name, up, down);
        if (c.id === DEFAULT_CATEGORY) {
          row.append(h('span', { class: 'muted cat-fixed' }, 'Silinemez'));
        } else if (confirming === c.id) {
          const n = confirmCount;
          const yes = h('button', { type: 'button', class: 'danger' }, 'Sil');
          const no = h('button', { type: 'button' }, 'Vazgeç');
          yes.addEventListener('click', () => { confirming = null; void run(() => api.noteCategoryDelete(c.id)); });
          no.addEventListener('click', () => { confirming = null; draw(); });
          row.append(h('span', { class: 'cat-confirm' }, `${n} not Notlar'a taşınacak.`), yes, no);
        } else {
          const del = h('button', { type: 'button', class: 'icon-button', title: 'Kategoriyi sil', 'aria-label': 'Kategoriyi sil' }, icon('trash-2', 16));
          del.addEventListener('click', () => {
            // Backend'in taşıyacağı tam sayı (arşivdekiler dahil).
            void api.noteCategoryCount(c.id).catch(() => counts.by_category[c.id] ?? 0).then((n) => { confirmCount = n; confirming = c.id; draw(); });
          });
          row.append(del);
        }
        return row;
      }));
    }

    const newName = h('input', { type: 'text', class: 'grow', maxLength: 40, placeholder: 'Yeni kategori adı', 'aria-label': 'Yeni kategori adı' });
    const newColor = colorSelect(null);
    const add = h('button', { type: 'button', class: 'primary' }, 'Ekle');
    const doAdd = (): void => {
      if (!newName.value.trim()) { newName.focus(); return; }
      const label = newName.value;
      newName.value = '';
      void run(() => api.noteCategoryAdd(label, newColor.value || null));
    };
    add.addEventListener('click', doAdd);
    newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    body.append(listBox, h('div', { class: 'cat-row cat-add' }, newColor, newName, add), msg);
    draw();
    openDialog('Kategoriler', body);
    newName.focus();
  }

  function renderTags(): void {
    const all = new Map<string, number>();
    for (const n of notes) for (const t of extractTags(n.text)) all.set(t, (all.get(t) ?? 0) + 1);
    const active = search.value.trim().toLocaleLowerCase('tr-TR');
    const sorted = [...all.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, 15);
    tagBar.replaceChildren(...sorted.map(([t, n]) => {
      const b = h('button', { type: 'button', class: 'md-tag' + (t === active ? ' active' : ''), title: `${n} not` }, t);
      b.addEventListener('click', () => setTagFilter(t));
      return b;
    }));
  }

  function render(): void {
    // Düzenleme başka nota geçtiyse ya da kapandıysa eski düzenleyici kaydedilip yok edilir.
    if (activeEdit && editing !== activeEdit.id) {
      const a = activeEdit;
      activeEdit = null;
      void disposeEdit(a);
    }
    renderCounts();
    renderTags();
    showDoneLabel.hidden = tab === 'archive' || tab === 'trash';
    list.replaceChildren();
    if (tab === 'trash') {
      const q = search.value.trim().toLocaleLowerCase('tr-TR');
      const trashed = notes.filter((n) => !q || n.text.toLocaleLowerCase('tr-TR').includes(q));
      countLabel.textContent = trashed.length ? `${trashed.length} not` : '';
      if (!trashed.length) { list.append(emptyState('Çöp kutusu boş', `Sildiğin notlar ${TRASH_DAYS} gün burada durur; istersen geri yükleyebilirsin.`)); return; }
      list.append(trashBar(counts.trash), ...trashed.map(trashRow));
      return;
    }
    const visible = notes.filter((n) => !pendingDeletes.has(n.id));
    countLabel.textContent = visible.length ? `${visible.length} not` : '';
    if (!visible.length) {
      list.append(tab === 'archive'
        ? emptyState('Arşiv boş', 'Bir notu menüsünden "Arşivle" diyerek buraya taşıyabilirsin.')
        : search.value || tab
          ? emptyState('Sonuç yok', 'Başka bir arama ya da kategori deneyin.')
          : emptyState('Henüz not yok', 'Yukarıdan ilk notunu ekle ya da tarayıcıda bir metni not olarak kaydet.', 'notes'));
      return;
    }
    for (const note of visible) list.append(noteRow(note));
  }

  async function refresh(): Promise<void> {
    if (editing !== null || reminding !== null) return; // düzenleme sırasında içerik değiştirilmez
    try {
      const archive = tab === 'archive';
      const trash = tab === 'trash';
      const page = await api.noteList(archive || trash ? '' : tab, trash ? '' : search.value, { archived: archive, showDone: archive || trash || showDone, sort });
      addForm.hidden = !page.available || trash;
      tabs.hidden = !page.available;
      catBtn.hidden = !page.available;
      sortSelect.hidden = !page.available || trash;
      searchBox.hidden = !page.available;
      newBtn.hidden = !page.available || trash;
      filterBar.hidden = !page.available || trash;
      if (!page.available) {
        notes = [];
        list.replaceChildren(emptyState('Notlar henüz tarayıcıda', 'Eklentide Ayarlar → Depolama → "Verileri masaüstüne taşı" de. Sonra notları burada da görüp ekleyebilirsin.'));
        return;
      }
      counts = { ...page.counts, trash: page.counts.trash ?? 0, by_category: page.counts.by_category ?? {} };
      const cats = await api.noteCategories().catch(() => null);
      if (cats?.length) {
        const changed = JSON.stringify(cats) !== JSON.stringify(categories);
        categories = cats;
        if (changed) { fillCategoryOptions(addCategory, categories, addCategory.value); renderTabs(); }
      }
      notes = trash ? await api.noteTrashList() : page.notes;
      render();
    } catch (e) { flash(errText(e)); }
  }

  renderTabs();
  addBtn.addEventListener('click', () => void add());
  search.addEventListener('input', debounce(() => void refresh(), 150));
  // Tarayıcıdan eklenenleri yakalamak için pencereye dönünce yenile.
  window.addEventListener('focus', () => { if (el.isConnected) void refresh(); });
  window.addEventListener('beforeunload', flushDeletes);
  document.addEventListener('keydown', (e) => {
    if (el.isConnected && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); search.focus(); search.select(); }
  });

  return { el, refresh, flushDeletes } as View & { flushDeletes: () => void };
}

let instance: (View & { flushDeletes?: () => void }) | null = null;
function ensureView(): View & { flushDeletes?: () => void } {
  if (!instance) instance = notesView();
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
