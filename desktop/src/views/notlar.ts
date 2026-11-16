import { icon } from '../../../design/icons';
import { api, errText, type Note, type NoteCategory, type NoteCounts, type NoteSort } from '../api';
import { debounce, h, type View } from '../dom';
import { extractTags, renderMarkdown, toggleTaskLine } from '../markdown';
import { emptyState, rowMenu } from '../view-components';

// Eklentideki slapmemo/categories.ts ile aynı etiketler.
const CATEGORIES: { id: NoteCategory; label: string }[] = [
  { id: 'note', label: 'Notlar' },
  { id: 'read', label: 'Okunacaklar' },
  { id: 'watch', label: 'İzlenecekler' },
  { id: 'idea', label: 'Fikirler' }
];
const labelOf = (id: string): string => CATEGORIES.find((c) => c.id === id)?.label ?? id;
const fmtMs = (ms: number): string => new Date(ms).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const UNDO_MS = 6000;
const LONG_LINES = 8;
const LONG_CHARS = 600;

const SORTS: { id: NoteSort; label: string }[] = [
  { id: 'new', label: 'En yeni' },
  { id: 'old', label: 'En eski' },
  { id: 'updated', label: 'Son düzenlenen' }
];

function readPref(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function writePref(key: string, value: string): void { try { localStorage.setItem(key, value); } catch { /* yoksay */ } }

function categorySelect(value: NoteCategory, cls = ''): HTMLSelectElement {
  const select = h('select', { 'aria-label': 'Kategori', class: cls });
  for (const c of CATEGORIES) select.append(h('option', { value: c.id }, c.label));
  select.value = value;
  return select;
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

type Tab = '' | NoteCategory | 'archive';

export function notesView(): View {
  let tab: Tab = '';
  let sort: NoteSort = (SORTS.find((s) => s.id === readPref('lifetools_notes_sort'))?.id) ?? 'new';
  let showDone = readPref('lifetools_notes_show_done') !== '0';
  let editing: number | null = null;
  let reminding: number | null = null;
  let notes: Note[] = [];
  let counts: NoteCounts = { all: 0, note: 0, read: 0, watch: 0, idea: 0, archived: 0 };
  const pendingDeletes = new Map<number, number>();
  const expandedPages = new Set<number>();
  const expandedBodies = new Set<number>();
  const pageCache = new Map<number, { text: string; saved_at: number }>();
  const imageCache = new Map<number, string>();

  const status = h('div', { class: 'muted status', role: 'status' });
  const flash = (text: string): void => { status.textContent = text; window.setTimeout(() => { if (status.textContent === text) status.textContent = ''; }, 3000); };

  // ---------- Sekmeler (sayılı) ----------
  const tabs = h('div', { class: 'chip-tabs', role: 'tablist', 'aria-label': 'Kategori' });
  const tabDefs: { id: Tab; label: string }[] = [{ id: '', label: 'Tümü' }, ...CATEGORIES, { id: 'archive', label: 'Arşiv' }];
  const tabButtons = tabDefs.map((c) => {
    const count = h('span', { class: 'tab-count' });
    const b = h('button', { type: 'button', role: 'tab', 'aria-selected': String(c.id === tab) }, c.label, count);
    b.addEventListener('click', () => {
      tab = c.id;
      tabButtons.forEach((x) => x.b.setAttribute('aria-selected', String(x.b === b)));
      if (c.id && c.id !== 'archive') addCategory.value = c.id;
      editing = null; reminding = null;
      void refresh();
    });
    tabs.append(b);
    return { id: c.id, b, count };
  });
  function renderCounts(): void {
    for (const t of tabButtons) {
      const n = t.id === '' ? counts.all : t.id === 'archive' ? counts.archived : counts[t.id];
      t.count.textContent = n ? String(n) : '';
    }
  }

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
  const addText = h('textarea', { rows: 4, class: 'grow note-add-text', placeholder: 'Yeni not… (Ctrl+Enter: ekle · Markdown: **kalın**, - [ ] yapılacak, #etiket)', maxLength: 10000 });
  const addCategory = categorySelect('note');
  const addUrl = h('input', { type: 'url', class: 'grow', placeholder: 'Bağlantı (isteğe bağlı)' });
  const addBtn = h('button', { type: 'button', class: 'primary' }, 'Ekle');
  const addForm = h('div', { class: 'card note-add' }, h('div', { class: 'note-add-input' }, icon('pencil', 18), addText), h('div', { class: 'toolbar' }, addCategory, addUrl, addBtn));

  // Ekleme kutusu: köşeden elle büyütülebilir (boyut hatırlanır), yazdıkça da kendiliğinden uzar.
  const ADD_HEIGHT_KEY = 'lifetools_notes_add_height';
  let manualHeight = Number(readPref(ADD_HEIGHT_KEY)) || 0;
  const autoGrow = (): void => {
    addText.style.height = 'auto';
    const cap = Math.max(manualHeight, Math.round(window.innerHeight * 0.6));
    addText.style.height = `${Math.min(cap, Math.max(manualHeight, addText.scrollHeight + 2))}px`;
  };
  if (manualHeight) addText.style.height = `${manualHeight}px`;
  addText.addEventListener('input', autoGrow);
  // Köşeden sürükleyerek boyutlandırma: fare bırakılınca yükseklik değiştiyse hatırla.
  let heightAtPress = 0;
  addText.addEventListener('pointerdown', () => { heightAtPress = addText.offsetHeight; });
  window.addEventListener('pointerup', () => {
    if (!heightAtPress) return;
    const now = addText.offsetHeight;
    if (Math.abs(now - heightAtPress) > 2) { manualHeight = now; writePref(ADD_HEIGHT_KEY, String(now)); }
    heightAtPress = 0;
  });

  // ---------- Silmeyi geri al ----------
  const undoText = h('span', {}, 'Not silindi.');
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
    window.clearTimeout(pendingDeletes.get(undoTarget));
    pendingDeletes.delete(undoTarget);
    undoTarget = null;
    undoBar.hidden = true;
    flash('Silme geri alındı.');
    void refresh();
  });
  /** Bekleyen silmeleri hemen uygular (görünümden çıkarken). */
  function flushDeletes(): void { for (const id of [...pendingDeletes.keys()]) void commitDelete(id); }

  const list = h('div', { class: 'note-list' });
  const newBtn = h('button', { type: 'button', class: 'primary' }, icon('plus', 16), 'Yeni not');
  newBtn.addEventListener('click', () => { addForm.scrollIntoView({ block: 'nearest' }); addText.focus(); });
  const el = h('section', { class: 'notes-view' },
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('notebook-pen', 26), 'Notlar'),
        h('p', { class: 'page-subtitle', title: 'Eklentiyle aynı veritabanı: burada eklediğin not tarayıcıda, tarayıcıda eklediğin not burada görünür.' }, 'Hızlı notlar al, etiketle ve her yerden ulaş.')),
      h('div', { class: 'page-actions' }, searchBox, newBtn)),
    h('div', { class: 'toolbar notes-tabs' }, tabs, sortSelect),
    addForm,
    filterBar,
    status,
    list,
    undoBar
  );

  async function add(): Promise<void> {
    const text = addText.value.trim();
    if (!text) { addText.focus(); return; }
    const url = addUrl.value.trim();
    if (url && !/^https?:\/\//i.test(url)) { flash('Bağlantı http:// veya https:// ile başlamalı.'); addUrl.focus(); return; }
    addBtn.disabled = true;
    try {
      await api.noteAdd(addCategory.value as NoteCategory, text, url || null, null);
      addText.value = ''; addUrl.value = '';
      autoGrow();
      flash('Not eklendi.');
      await refresh();
      addText.focus();
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

  // ---------- Düzenleyiciler ----------
  function editor(note: Note): HTMLElement {
    const text = h('textarea', { rows: Math.min(14, Math.max(4, note.text.split('\n').length + 1)), class: 'grow', maxLength: 10000 });
    text.value = note.text;
    const userNote = h('input', { type: 'text', class: 'grow', placeholder: 'Notum (isteğe bağlı açıklama)' });
    userNote.value = note.user_note ?? '';
    const category = categorySelect(note.category);
    const save = h('button', { type: 'button', class: 'primary' }, 'Kaydet');
    const cancel = h('button', { type: 'button' }, 'Vazgeç');
    const doSave = async (): Promise<void> => {
      try { await api.noteUpdate(note.id, category.value as NoteCategory, text.value, userNote.value.trim() || null); editing = null; flash('Kaydedildi.'); await refresh(); }
      catch (e) { flash(errText(e)); }
    };
    save.addEventListener('click', () => void doSave());
    cancel.addEventListener('click', () => { editing = null; render(); });
    const keys = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); editing = null; render(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void doSave(); }
    };
    text.addEventListener('keydown', keys); userNote.addEventListener('keydown', keys);
    queueMicrotask(() => text.focus());
    return h('div', { class: 'list-row note-edit' }, h('div', { class: 'list-row-content' },
      text,
      h('div', { class: 'toolbar' }, category, userNote, save, cancel),
      h('p', { class: 'hint' }, 'Ctrl+Enter: kaydet · Esc: vazgeç · # Başlık, - liste, - [ ] yapılacak, **kalın**, *eğik*, `kod`, #etiket')));
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

    const cat = categorySelect(note.category, 'chip chip-select');
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
      { label: 'Sil', danger: true, run: () => scheduleDelete(note.id) }
    ]);

    const editOnClick = (): void => {
      if (window.getSelection()?.toString()) return; // metin seçiliyorsa düzenlemeye geçme
      editing = note.id; reminding = null; render();
    };
    return h('div', { class: 'list-row clickable note-row' + (done ? ' done' : '') + (note.pinned && !archived ? ' pinned' : ''), title: 'Tıkla: düzenle', onClick: editOnClick },
      h('div', { class: 'list-row-leading' }, doneBtn),
      content,
      h('div', { class: 'list-row-meta muted' }, fmtMs(note.created_at)),
      h('div', { class: 'list-row-actions' }, copyBtn, menu));
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
    renderCounts();
    renderTags();
    showDoneLabel.hidden = tab === 'archive';
    list.replaceChildren();
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
      const page = await api.noteList(archive ? '' : tab, search.value, { archived: archive, showDone: archive || showDone, sort });
      addForm.hidden = !page.available;
      tabs.hidden = !page.available;
      sortSelect.hidden = !page.available;
      searchBox.hidden = !page.available;
      newBtn.hidden = !page.available;
      filterBar.hidden = !page.available;
      if (!page.available) {
        notes = [];
        list.replaceChildren(emptyState('Notlar henüz tarayıcıda', 'Eklentide Ayarlar → Depolama → "Verileri masaüstüne taşı" de. Sonra notları burada da görüp ekleyebilirsin.'));
        return;
      }
      notes = page.notes;
      counts = page.counts;
      render();
    } catch (e) { flash(errText(e)); }
  }

  addBtn.addEventListener('click', () => void add());
  addText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void add(); } });
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
