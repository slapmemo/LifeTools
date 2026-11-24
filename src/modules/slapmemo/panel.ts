import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  confirmSecondClick,
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  formatRelativeDate,
  showToast,
  type KebabMenuItem
} from '../../panel/ui';
import type { NoteCategory, NoteCategoryRow } from './categories';
import { CATEGORY_LABELS, DEFAULT_CATEGORY, NOTE_CATEGORIES, NOTE_COLORS } from './categories';
import type { Note } from './repo';
import { createNotesRepo, NoteVersionConflict, TRASH_DAYS } from './repo';
import { clearUnsaved, flushOrStash, readUnsaved } from './unsaved';
import { renderMarkdown, toggleTaskLine } from '../../../shared/notes/render';
import { loadNoteEditorUI } from '../../../shared/notes/lazy';
import type { NoteEditorHandle } from '../../../shared/notes/ui';
import { BUBBLE_ENABLED_KEY, BUBBLE_HIDDEN_KEY, BUBBLE_ORIGINS } from './bubble-logic';
import { NOTE_HINT_ENABLED_KEY } from './page-hint';
import { PAGE_COPY_KEY } from './settings';

const LIST_LIMIT = 50;
const SEARCH_DEBOUNCE_MS = 250;
const DRAFT_KEY = 'lifetools_panel_notes_draft';
/** Bu kadar satırı ya da karakteri aşan notlar kısaltılır ve "Devamını göster" çıkar. */
const CLAMP_LINES = 6;
const CLAMP_CHARS = 400;

/** Çöp kutusu sekmesinin filtre değeri (gerçek bir kategori kimliği olamaz). */
const TRASH = '__trash__';
const SORT_KEY = 'lifetools_panel_notes_sort';
const DAY_MS = 86_400_000;
const COLOR_LABELS: Record<string, string> = { yellow: 'Sarı', green: 'Yeşil', blue: 'Mavi', pink: 'Pembe', purple: 'Mor' };

const EMPTY_TITLES: Record<string, string> = {
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
    editorHost: $<HTMLElement>('#memo-editor'),
    category: $<HTMLSelectElement>('#memo-category'),
    save: $<HTMLButtonElement>('#memo-save'),
    cancel: document.querySelector<HTMLButtonElement>('#memo-cancel'),
    feedback: $<HTMLElement>('#memo-feedback'),
    tabs: $<HTMLElement>('#memo-tabs'),
    search: $<HTMLInputElement>('#memo-search'),
    list: $<HTMLElement>('#memo-list'),
    empty: $<HTMLElement>('#memo-empty')
  };

  // Filtre: null = tümü, TRASH = çöp kutusu, aksi hâlde kategori kimliği.
  let filter: string | null = null;
  // Kategoriler veritabanından gelir; yüklenene kadar (ya da hata olursa) yerleşik dördü kullanılır.
  let categories: NoteCategoryRow[] = NOTE_CATEGORIES.map((id, i) => ({ id, label: CATEGORY_LABELS[id], color: null, position: i, builtin: 1, created_at: 0 }));
  let trashCount = 0;
  let sortManual = false;
  try { sortManual = localStorage.getItem(SORT_KEY) === 'manual'; } catch { /* yok say */ }
  const labelOf = (id: string): string => categories.find(c => c.id === id)?.label ?? CATEGORY_LABELS[id] ?? id;
  // Listede gösterilen not sayısı; "Daha fazla not göster" ile 50'şer artar, kategori/arama değişince sıfırlanır.
  let shown = LIST_LIMIT;
  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.id = 'memo-more';
  moreBtn.textContent = 'Daha fazla not göster';
  moreBtn.hidden = true;
  moreBtn.addEventListener('click', () => { shown += LIST_LIMIT; void render(); });
  dom.list.after(moreBtn);
  let editingId: number | null = null;
  // Açık satır içi düzenleyici (aynı anda en çok bir tane) ve ekleme formundaki düzenleyici.
  let activeEditor: { id: number; handle: NoteEditorHandle; dispose(): void } | null = null;
  let addEditor: NoteEditorHandle | null = null;
  const pendingMounts: Array<() => Promise<void>> = [];
  const expanded = new Set<number>();
  let renderSeq = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let imageObserver: IntersectionObserver | undefined;
  let imageQueue: Promise<void> = Promise.resolve();

  const bubbleToggle = document.querySelector<HTMLInputElement>('#memo-bubble-enabled');
  const hintToggle = document.querySelector<HTMLInputElement>('#memo-hint-enabled');
  const copyToggle = document.querySelector<HTMLInputElement>('#memo-page-copy-enabled');
  if (copyToggle) {
    void chrome.storage.local.get({ [PAGE_COPY_KEY]: true }).then(data => { copyToggle.checked = data[PAGE_COPY_KEY] !== false; });
    copyToggle.addEventListener('change', () => { void chrome.storage.local.set({ [PAGE_COPY_KEY]: copyToggle.checked }).catch(() => { copyToggle.checked = !copyToggle.checked; notify('Ayar kaydedilemedi.', 'error'); }); });
  }
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
    const data = await chrome.storage.local.get({ [BUBBLE_ENABLED_KEY]: true, [BUBBLE_HIDDEN_KEY]: [] });
    bubbleToggle.checked = data[BUBBLE_ENABLED_KEY] !== false && await chrome.permissions.contains({ origins: BUBBLE_ORIGINS });
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

  async function mountAddEditor(): Promise<void> {
    if (addEditor) { addEditor.focus(); return; }
    const { mountNoteEditor } = await loadNoteEditorUI();
    if (addEditor || dom.form.hidden) return;
    addEditor = mountNoteEditor(dom.editorHost, {
      markdown: '',
      placeholder: 'Hızlı not yaz… (Ctrl+Enter ile kaydet)',
      draftKey: DRAFT_KEY,
      compact: true,
      onFocusMode: setFocusClass
    });
    addEditor.focus();
  }

  function destroyAddEditor(): void {
    addEditor?.destroy();
    addEditor = null;
    setFocusClass(false);
  }

  /** Odak modu: düzenleyici panel alanını doldurur (notes.css .is-focus); gövdeye sınıf koyup panel.css ile çerçeveyi gizleriz. */
  function setFocusClass(on: boolean): void {
    document.body.classList.toggle('memo-focus', on);
  }

  function toggleNewForm(open?: boolean): void {
    const show = open ?? dom.form.hidden;
    dom.form.hidden = !show;
    if (show) {
      if (filter && filter !== TRASH) dom.category.value = filter;
      void mountAddEditor().catch(() => notify('Düzenleyici yüklenemedi.', 'error'));
    } else {
      // Taslak localStorage'da kalır; form yeniden açılınca geri gelir.
      destroyAddEditor();
    }
  }

  dom.newBtn?.addEventListener('click', () => toggleNewForm());
  dom.cancel?.addEventListener('click', () => toggleNewForm(false));

  const tabButtons = new Map<string, HTMLButtonElement>();

  /** Kategori listesini ve çöp sayısını yeniler; sekmeleri, ekleme formundaki seçimi ve yönetim listesini yeniden kurar. */
  async function refreshCategories(): Promise<void> {
    try {
      const rows = await repo.listCategories();
      if (rows.length) categories = rows;
      trashCount = await repo.trashCount();
    } catch { /* eldeki liste kalır */ }
    if (filter !== null && filter !== TRASH && !categories.some(c => c.id === filter)) filter = null;
    const previous = dom.category.value;
    dom.category.replaceChildren(...categories.map(category => {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.label;
      return option;
    }));
    dom.category.value = categories.some(c => c.id === previous) ? previous : DEFAULT_CATEGORY;

    const tabDefs: Array<[string, string]> = [['all', 'Tümü'], ...categories.map((c): [string, string] => [c.id, c.label]), [TRASH, trashCount ? `Çöp kutusu (${trashCount})` : 'Çöp kutusu']];
    tabButtons.clear();
    dom.tabs.replaceChildren();
    for (const [key, label] of tabDefs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seg-btn';
      button.textContent = label;
      button.addEventListener('click', () => {
        filter = key === 'all' ? null : key;
        shown = LIST_LIMIT;
        void render();
      });
      tabButtons.set(key, button);
      dom.tabs.append(button);
    }
    renderCategoryManager();
  }

  // Sıralama seçimi (Yeni önce / Elle).
  const sortSelect = document.createElement('select');
  sortSelect.id = 'memo-sort';
  sortSelect.setAttribute('aria-label', 'Sıralama');
  for (const [value, label] of [['new', 'Yeni önce'], ['manual', 'Elle sıra']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; sortSelect.append(option);
  }
  sortSelect.value = sortManual ? 'manual' : 'new';
  sortSelect.addEventListener('change', () => {
    sortManual = sortSelect.value === 'manual';
    try { localStorage.setItem(SORT_KEY, sortSelect.value); } catch { /* yok say */ }
    void render();
  });
  dom.tabs.after(sortSelect);

  // Çöp kutusu çubuğu: açıklama ve "Çöpü boşalt".
  const trashBar = document.createElement('div');
  trashBar.className = 'memo-trash-bar muted';
  trashBar.hidden = true;
  const trashText = document.createElement('span');
  trashText.textContent = `Çöpteki notlar ${TRASH_DAYS} gün sonra kalıcı olarak silinir.`;
  const emptyBtn = document.createElement('button');
  emptyBtn.type = 'button';
  emptyBtn.className = 'danger';
  emptyBtn.textContent = 'Çöpü boşalt';
  confirmSecondClick(emptyBtn, async () => {
    try {
      const count = await repo.emptyTrash();
      notify(`${count} not kalıcı olarak silindi.`, 'success');
      await render();
    } catch { notify('Çöp boşaltılamadı. Tekrar dene.', 'error'); }
  }, 'Tümü kalıcı silinecek — onayla', 4000);
  trashBar.append(trashText, emptyBtn);
  dom.list.before(trashBar);

  // Kategori yönetimi (notlar ayarları alanında).
  const catManager = document.querySelector<HTMLElement>('#memo-cats');
  const catForm = document.querySelector<HTMLFormElement>('#memo-cat-form');
  const catInput = document.querySelector<HTMLInputElement>('#memo-cat-name');
  function renderCategoryManager(): void {
    if (!catManager) return;
    const rows = categories.map((category, index) => {
      const li = document.createElement('li');
      li.className = 'memo-cat-row';
      const name = document.createElement('input');
      name.type = 'text'; name.value = category.label; name.maxLength = 40; name.setAttribute('aria-label', `${category.label} kategori adı`);
      name.addEventListener('change', () => { void repo.renameCategory(category.id, name.value).then(() => refreshAndRender()).catch(() => { name.value = category.label; notify('Kategori adı değiştirilemedi.', 'error'); }); });
      const color = document.createElement('select');
      color.setAttribute('aria-label', `${category.label} rengi`);
      for (const value of ['', ...NOTE_COLORS]) {
        const option = document.createElement('option'); option.value = value; option.textContent = value ? COLOR_LABELS[value] : 'Renksiz'; color.append(option);
      }
      color.value = category.color ?? '';
      color.addEventListener('change', () => { void repo.recolorCategory(category.id, color.value || null).then(() => refreshAndRender()).catch(() => notify('Renk kaydedilemedi.', 'error')); });
      const move = (delta: number): void => {
        const ids = categories.map(c => c.id);
        const target = index + delta;
        if (target < 0 || target >= ids.length) return;
        [ids[index], ids[target]] = [ids[target], ids[index]];
        void repo.reorderCategories(ids).then(() => refreshAndRender()).catch(() => notify('Sıra kaydedilemedi.', 'error'));
      };
      const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.setAttribute('aria-label', `${category.label} yukarı`); up.disabled = index === 0; up.addEventListener('click', () => move(-1));
      const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.setAttribute('aria-label', `${category.label} aşağı`); down.disabled = index === categories.length - 1; down.addEventListener('click', () => move(1));
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Sil'; remove.className = 'danger';
      if (category.id === DEFAULT_CATEGORY) { remove.disabled = true; remove.title = '"Notlar" silinemez'; }
      else {
        // Onay etiketi taşınacak not sayısını gösterir; sayı gelene kadar genel etiket kullanılır.
        const arm = (label: string): void => confirmSecondClick(remove, async () => {
          try {
            const moved = await repo.deleteCategory(category.id);
            if (filter === category.id) filter = null;
            notify(`Kategori silindi${moved ? `; ${moved} not Notlar'a taşındı` : ''}.`, 'success');
            await refreshAndRender();
          } catch { notify('Kategori silinemedi.', 'error'); }
        }, label, 4000);
        void repo.countInCategory(category.id).then(n => arm(`${n} not Notlar'a taşınacak — onayla`)).catch(() => arm("Notlar'a taşınacak — onayla"));
      }
      li.append(name, color, up, down, remove);
      return li;
    });
    catManager.replaceChildren(...rows);
  }
  async function refreshAndRender(): Promise<void> { await render(); }
  catForm?.addEventListener('submit', event => {
    event.preventDefault();
    const label = catInput?.value.trim() ?? '';
    if (!label) { notify('Kategori adı yaz.', 'error'); return; }
    void repo.addCategory(label).then(async () => { if (catInput) catInput.value = ''; await render(); }).catch(() => notify('Kategori eklenemedi.', 'error'));
  });

  /** Not gövdesi: biçimli çizim, uzun notta "Devamını göster", tıklanabilir görev kutuları / bağlantı / #etiket. */
  function buildBody(note: Note): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'memo-body';
    const rendered = renderMarkdown(note.text, {
      onToggleTask: (line, checked) => {
        void (async () => {
          try {
            await repo.updateNoteText(note.id, toggleTaskLine(note.text, line, checked), note.updated_at);
          } catch (error) {
            notify(error instanceof NoteVersionConflict ? 'Bu not başka yerde değişti; liste yenilendi.' : 'Not güncellenemedi. Tekrar dene.', 'error');
          }
          await render();
        })();
      },
      onOpenUrl: url => { window.open(url, '_blank', 'noopener,noreferrer'); },
      onTag: tag => {
        dom.search.value = tag;
        shown = LIST_LIMIT;
        void render();
      }
    });
    rendered.classList.add('memo-md');
    const long = note.text.length > CLAMP_CHARS || note.text.split('\n').length > CLAMP_LINES;
    wrap.append(rendered);
    if (long) {
      const open = expanded.has(note.id);
      rendered.classList.toggle('is-clamped', !open);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'link memo-more-text';
      toggle.textContent = open ? 'Daha az göster' : 'Devamını göster';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.addEventListener('click', () => {
        const nowOpen = !expanded.has(note.id);
        if (nowOpen) expanded.add(note.id); else expanded.delete(note.id);
        rendered.classList.toggle('is-clamped', !nowOpen);
        toggle.textContent = nowOpen ? 'Daha az göster' : 'Devamını göster';
        toggle.setAttribute('aria-expanded', String(nowOpen));
      });
      wrap.append(toggle);
    }
    return wrap;
  }

  /** Düzenleyiciyi flush edip kapatır; ardından listeyi yeniler. */
  async function closeEditor(): Promise<void> {
    const current = activeEditor;
    if (!current) { editingId = null; return; }
    // Kaydedilemediyse (hata/çakışma) düzenleyici açık kalır; metin ayrıca saklanır (sonraki açılışta "Geri yükle").
    if (!(await flushOrStash(current.handle, current.id, localStorage))) {
      notify('Değişiklikler kaydedilemedi; düzenleyici açık bırakıldı. Metin bu cihazda saklandı.', 'error');
      return;
    }
    current.dispose();
    editingId = null;
    await render();
  }

  function buildInlineEditor(note: Note): HTMLElement {
    const box = document.createElement('div');
    box.className = 'inline-editor';
    const host = document.createElement('div');
    host.className = 'memo-editor-host';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.maxLength = 500;
    noteInput.placeholder = 'Notum (isteğe bağlı)…';
    noteInput.value = note.user_note ?? '';
    noteInput.setAttribute('aria-label', 'Notum');
    const actions = document.createElement('div');
    actions.className = 'inline-editor-actions';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Kapat';
    closeBtn.addEventListener('click', () => { void closeEditor(); });
    actions.append(closeBtn);
    const stash = readUnsaved(localStorage, note.id);
    if (stash && stash.markdown.trim() !== note.text.trim()) {
      const bar = document.createElement('div');
      bar.className = 'memo-unsaved-bar';
      bar.setAttribute('role', 'alert');
      const text = document.createElement('span');
      text.textContent = `Kaydedilmemiş bir değişiklik var (${new Date(stash.savedAt).toLocaleString('tr-TR')}).`;
      const restoreBtn = document.createElement('button'); restoreBtn.type = 'button'; restoreBtn.textContent = 'Geri yükle';
      const dropBtn = document.createElement('button'); dropBtn.type = 'button'; dropBtn.textContent = 'Sil';
      dropBtn.addEventListener('click', () => { clearUnsaved(localStorage, note.id); bar.remove(); });
      restoreBtn.addEventListener('click', () => { void unsavedRestore?.(stash.markdown).then(() => bar.remove()).catch(() => notify('Geri yüklenemedi.', 'error')); });
      bar.append(text, restoreBtn, dropBtn);
      box.append(bar);
    } else if (stash) clearUnsaved(localStorage, note.id);
    let unsavedRestore: ((markdown: string) => Promise<void>) | undefined;
    box.append(host, noteInput, actions);

    pendingMounts.push(async () => {
      const { mountNoteEditor, NoteConflictError } = await loadNoteEditorUI();
      if (editingId !== note.id || !box.isConnected) return;
      let version = note.updated_at;
      const persist = async (markdown: string, force: boolean): Promise<void> => {
        try {
          const saved = await repo.updateNote(note.id, markdown, noteInput.value, force ? undefined : version);
          if (!saved) throw new Error('Not bulunamadı');
          version = saved.updated_at;
        } catch (error) {
          if (error instanceof NoteVersionConflict) throw new NoteConflictError();
          throw error;
        }
      };
      const handle = mountNoteEditor(host, {
        markdown: note.text,
        compact: true,
        autosave: true,
        onFocusMode: setFocusClass,
        onSave: (markdown, ctx) => persist(markdown, ctx.force),
        onConflict: async choice => {
          if (choice !== 'reload') return;
          const fresh = await repo.getNote(note.id);
          if (!fresh) { notify('Bu not artık yok.', 'error'); return; }
          version = fresh.updated_at;
          noteInput.value = fresh.user_note ?? '';
          handle.setMarkdown(fresh.text);
        }
      });
      // "Notum" alanı değişince metinle birlikte hemen kaydedilir.
      // Saklanan metni düzenleyiciye alır ve (kullanıcı istediği için) zorla kaydeder.
      unsavedRestore = async markdown => {
        handle.setMarkdown(markdown);
        await persist(markdown, true);
        clearUnsaved(localStorage, note.id);
      };
      noteInput.addEventListener('change', () => { void persist(handle.getMarkdown(), false).catch(() => notify('Notum kaydedilemedi.', 'error')); });
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && !event.defaultPrevented && !handle.isFocusMode()) { event.preventDefault(); void closeEditor(); }
      };
      const onOutside = (event: PointerEvent): void => {
        const target = event.target as Node | null;
        if (target && !box.contains(target) && !(target instanceof Element && target.closest('.panel-toast'))) void closeEditor();
      };
      box.addEventListener('keydown', onKey);
      // Düzenleyiciyi açan tıklamayı yutmamak için bir sonraki turda dinlemeye başla.
      const timer = setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
      activeEditor = {
        id: note.id,
        handle,
        dispose: () => {
          clearTimeout(timer);
          document.removeEventListener('pointerdown', onOutside, true);
          handle.destroy();
          setFocusClass(false);
          if (activeEditor?.handle === handle) activeEditor = null;
        }
      };
      handle.focus();
    });
    return box;
  }

  /** "Çoğalt": metin, kategori, adres, "notum" ve renk kopyalanır; görsel ve sayfa kopyası kopyalanmaz. */
  async function duplicateNote(note: Note): Promise<void> {
    try {
      const lines = note.text.split('\n');
      lines[0] = `${lines[0]} (kopya)`;
      const { note: copy } = await repo.addNote({ category: note.category, text: lines.join('\n'), url: note.url, pageTitle: note.page_title, allowDuplicate: true });
      if (note.user_note) await repo.updateUserNote(copy.id, note.user_note);
      if (note.color) await repo.setNoteColor(copy.id, note.color);
      notify('Not çoğaltıldı.', 'success');
      await render();
    } catch {
      notify('Not çoğaltılamadı. Tekrar dene.', 'error');
    }
  }

  function buildItem(note: Note, kinds: Set<string>): HTMLLIElement {
    const contentWrap = document.createElement('div');
    contentWrap.className = 'memo-row-main';

    if (editingId !== note.id) contentWrap.append(buildBody(note));
    if (kinds.has('page')) {
      const link = document.createElement('button'); link.type = 'button'; link.textContent = 'Sayfa kopyası';
      link.addEventListener('click', () => { void (async () => {
        const page = await repo.getPage(note.id); if (!page) return;
        const dialog = document.createElement('dialog');
        const close = document.createElement('button'); close.textContent = 'Kapat'; close.addEventListener('click', () => dialog.close());
        const source = document.createElement('a'); source.textContent = note.url ?? ''; source.href = note.url ?? '#'; source.target = '_blank'; source.rel = 'noopener noreferrer';
        const text = document.createElement('p'); text.textContent = page.text; text.style.whiteSpace = 'pre-wrap';
        dialog.append(close, document.createElement('br'), source, text); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
      })().catch(() => notify('Sayfa kopyası yüklenemedi.', 'error')); });
      contentWrap.append(link);
    }
    if (kinds.has('image')) { const img = document.createElement('img'); img.dataset.noteImage = String(note.id); img.alt = 'Ekran görüntüsü'; img.style.cssText = 'display:block;width:160px;height:100px;object-fit:contain;cursor:pointer'; contentWrap.append(img); }

    if (note.user_note) {
      const userNote = document.createElement('p');
      userNote.className = 'memo-user-note muted';
      userNote.textContent = `Notum: ${note.user_note}`;
      contentWrap.append(userNote);
    }

    if (editingId === note.id) contentWrap.append(buildInlineEditor(note));

    const metaWrap = document.createElement('div');
    metaWrap.className = 'memo-meta';

    if (filter === null) {
      const badge = document.createElement('span');
      badge.className = 'chip';
      badge.textContent = labelOf(note.category);
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
          void (async () => {
            const wasThis = editingId === note.id;
            await closeEditor();
            if (wasThis) return;
            editingId = note.id;
            await render();
          })();
        }
      },
      { label: 'Çoğalt', icon: 'copy', onSelect: () => duplicateNote(note) },
      ...(sortManual && !dom.search.value.trim() && filter !== TRASH ? [
        { label: 'Yukarı taşı', onSelect: () => { const li = dom.list.querySelector<HTMLElement>(`li[data-note-id="${note.id}"]`); if (li) moveRow(li, -1); } },
        { label: 'Aşağı taşı', onSelect: () => { const li = dom.list.querySelector<HTMLElement>(`li[data-note-id="${note.id}"]`); if (li) moveRow(li, 1); } }
      ] : []),
      { label: 'Renk…', onSelect: () => openColorDialog(note) },
      { label: 'Geçmiş…', onSelect: () => openHistoryDialog(note) },
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
          if (editingId === note.id) { activeEditor?.dispose(); editingId = null; }
          await repo.deleteNote(note.id);
          dom.feedback.textContent = 'Not çöp kutusuna taşındı';
          dom.feedback.className = 'feedback success';
          showToast('Not çöp kutusuna taşındı', 'info', {
            label: 'Geri al',
            onClick: () => { void repo.restoreNote(note.id).then(() => render()).catch(() => notify('Not geri alınamadı.', 'error')); }
          });
          await render();
        } catch {
          notify('Not çöp kutusuna taşınamadı. Tekrar dene.', 'error');
        }
      }
    });

    const row = createListRow({
      content: contentWrap,
      meta: metaWrap,
      actions: createKebabMenu(menuItems, 'Not işlemleri'),
      className: 'memo-item'
    });
    row.dataset.noteId = String(note.id);
    if (note.color) row.dataset.color = note.color;
    if (sortManual && !dom.search.value.trim() && filter !== TRASH && editingId !== note.id) enableDrag(row);
    return row;
  }

  /** Elle sıralama: satırı sürükleyip bırakınca görünen sıra repo.reorder ile konum olarak yazılır. */
  let dragRow: HTMLElement | null = null;
  function enableDrag(row: HTMLElement): void {
    row.draggable = true;
    row.classList.add('memo-draggable');
    row.addEventListener('dragstart', event => { dragRow = row; row.classList.add('dragging'); event.dataTransfer?.setData('text/plain', row.dataset.noteId ?? ''); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; });
    row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragRow = null; });
    row.addEventListener('dragover', event => {
      if (!dragRow || dragRow === row) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      row.parentElement?.insertBefore(dragRow, event.clientY < rect.top + rect.height / 2 ? row : row.nextSibling);
    });
    row.addEventListener('drop', event => { event.preventDefault(); persistOrder(); });
    // Klavye: odaktaki satırda Alt+↑ / Alt+↓.
    row.tabIndex = 0;
    row.addEventListener('keydown', event => {
      if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.target !== row) return;
      event.preventDefault();
      moveRow(row, event.key === 'ArrowUp' ? -1 : 1);
    });
  }

  function persistOrder(): void {
    const ids = [...dom.list.querySelectorAll<HTMLElement>('li[data-note-id]')].map(li => Number(li.dataset.noteId));
    // Okuma + yazma arka planda, DB kilidi ve tek işlem altında çalışır.
    void (chrome.runtime.sendMessage({ type: 'slapmemo:reorder', ids, category: filter }) as Promise<{ ok?: boolean } | undefined>)
      .then(res => { if (!res?.ok) throw new Error('reorder'); })
      .catch(() => { notify('Sıra kaydedilemedi.', 'error'); return render(); });
  }

  /** Satırı bir yukarı/aşağı taşır ve sırayı yazar. */
  function moveRow(row: HTMLElement, delta: -1 | 1): void {
    const sibling = delta < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!(sibling instanceof HTMLElement) || !sibling.dataset.noteId) return;
    if (delta < 0) sibling.before(row); else sibling.after(row);
    row.focus();
    persistOrder();
  }

  /** Küçük "dialog" yardımcısı: başlık + içerik, Kapat düğmesi. */
  function openDialog(title: string, build: (body: HTMLElement, close: () => void) => void): void {
    const dialog = document.createElement('dialog');
    dialog.className = 'memo-dialog';
    const heading = document.createElement('h3'); heading.textContent = title;
    const body = document.createElement('div');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Kapat';
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.append(heading, body, close);
    document.body.append(dialog);
    build(body, () => dialog.close());
    dialog.showModal();
  }

  function openColorDialog(note: Note): void {
    openDialog('Not rengi', (body, close) => {
      const group = document.createElement('div'); group.className = 'memo-swatches';
      for (const value of [...NOTE_COLORS, null]) {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'memo-swatch';
        swatch.textContent = value ? COLOR_LABELS[value] : 'Renksiz';
        if (value) swatch.dataset.color = value;
        swatch.setAttribute('aria-pressed', String((note.color ?? null) === value));
        swatch.addEventListener('click', () => { void repo.setNoteColor(note.id, value).then(() => { close(); return render(); }).catch(() => notify('Renk kaydedilemedi.', 'error')); });
        group.append(swatch);
      }
      body.append(group);
    });
  }

  function openHistoryDialog(note: Note): void {
    void (async () => {
      let rows;
      try { rows = await repo.listHistory(note.id); } catch { notify('Geçmiş yüklenemedi.', 'error'); return; }
      openDialog('Düzenleme geçmişi', (body, close) => {
        if (!rows.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Bu notun henüz önceki hâli yok.'; body.append(empty); return; }
        const layout = document.createElement('div'); layout.className = 'memo-history';
        const list = document.createElement('ul'); list.className = 'memo-history-list';
        const preview = document.createElement('div'); preview.className = 'memo-history-preview';
        const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'primary'; restore.textContent = 'Bu hâle dön'; restore.disabled = true;
        let selected: number | null = null;
        for (const row of rows) {
          const item = document.createElement('li');
          const pick = document.createElement('button'); pick.type = 'button'; pick.className = 'link';
          pick.textContent = new Date(row.saved_at).toLocaleString('tr-TR');
          pick.addEventListener('click', () => {
            selected = row.id; restore.disabled = false;
            list.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === pick)));
            preview.replaceChildren(renderMarkdown(row.text));
          });
          item.append(pick); list.append(item);
        }
        restore.addEventListener('click', () => {
          if (selected === null) return;
          void repo.restoreHistory(selected).then(() => { notify('Önceki hâle dönüldü.', 'success'); close(); return render(); }).catch(() => notify('Geri dönülemedi.', 'error'));
        });
        layout.append(list, preview);
        body.append(layout, restore);
      });
    })();
  }

  /** Çöp kutusundaki satır: kalan gün, Geri yükle, Kalıcı sil. */
  function buildTrashItem(note: Note): HTMLLIElement {
    const content = document.createElement('div');
    const body = document.createElement('div'); body.className = 'memo-body';
    const rendered = renderMarkdown(note.text); rendered.classList.add('memo-md', 'is-clamped'); body.append(rendered);
    content.append(body);
    const days = Math.max(0, TRASH_DAYS - Math.floor((Date.now() - (note.deleted_at ?? Date.now())) / DAY_MS));
    const meta = document.createElement('div'); meta.className = 'memo-meta';
    const info = document.createElement('span'); info.className = 'memo-date muted';
    info.textContent = days > 0 ? `${days} gün sonra kalıcı olarak silinecek` : 'Bugün kalıcı olarak silinecek';
    meta.append(info);
    const actions = document.createElement('div'); actions.className = 'row-action-group';
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Geri yükle';
    restore.addEventListener('click', () => { void repo.restoreNote(note.id).then(() => { notify('Not geri yüklendi.', 'success'); return render(); }).catch(() => notify('Not geri yüklenemedi.', 'error')); });
    const purge = document.createElement('button'); purge.type = 'button'; purge.className = 'danger'; purge.textContent = 'Kalıcı sil';
    confirmSecondClick(purge, async () => {
      try { await repo.purgeNote(note.id); notify('Not kalıcı olarak silindi.', 'success'); await render(); } catch { notify('Not silinemedi.', 'error'); }
    }, 'Emin misin?');
    actions.append(restore, purge);
    const row = createListRow({ content, meta, actions, className: 'memo-item' });
    if (note.color) row.dataset.color = note.color;
    return row;
  }

  async function render(): Promise<void> {
    void renderBubbleSettings().catch(() => {});
    if (hintToggle) void chrome.storage.local.get({ [NOTE_HINT_ENABLED_KEY]: true }).then(async data => { hintToggle.checked = data[NOTE_HINT_ENABLED_KEY] !== false && await chrome.permissions.contains({ origins: BUBBLE_ORIGINS }); }).catch(() => {});
    const seq = ++renderSeq;
    // Açık düzenleyiciyi liste yenilenmeden önce kaydet; yenilenen liste güncel metni göstersin.
    // Düzenleme hâlâ sürüyorsa (editingId) satır yeniden kurulur ve düzenleyici baştan bağlanır.
    // Kaydedilemezse metin saklanır (flushOrStash); düzenleme sürüyorsa yeniden açılışta "Geri yükle" çıkar.
    if (activeEditor) { await flushOrStash(activeEditor.handle, activeEditor.id, localStorage); activeEditor.dispose(); }
    if (seq !== renderSeq) return;
    await refreshCategories();
    if (seq !== renderSeq) return;
    trashBar.hidden = filter !== TRASH;
    sortSelect.hidden = filter === TRASH;
    for (const [key, button] of tabButtons) {
      const active = (key === 'all' ? null : key) === filter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    const query = dom.search.value.trim();
    try {
      if (filter === TRASH) {
        const needle = query.toLocaleLowerCase('tr-TR');
        const trashed = (await repo.listTrash()).filter(note => !needle || note.text.toLocaleLowerCase('tr-TR').includes(needle));
        if (seq !== renderSeq) return;
        moreBtn.hidden = true;
        dom.list.replaceChildren(...trashed.map(buildTrashItem));
        dom.list.hidden = trashed.length === 0;
        dom.empty.hidden = trashed.length > 0;
        if (!trashed.length) dom.empty.replaceChildren(createEmptyState({ icon: 'notebook-pen', title: query ? 'Aramanla eşleşen not yok.' : 'Çöp kutusu boş.', hint: `Sildiğin notlar ${TRASH_DAYS} gün burada durur.` }));
        return;
      }
      const fetched = query
        ? await repo.searchNotes(query, filter)
        : await repo.listNotes({ category: filter, limit: shown + 1, offset: 0, sort: sortManual ? 'manual' : 'new' });
      if (seq !== renderSeq) return;
      const hasMore = !query && fetched.length > shown;
      const notes = hasMore ? fetched.slice(0, shown) : fetched;
      moreBtn.hidden = !hasMore;

      const attachments = await repo.attachments(notes.map(note => note.id));
      if (seq !== renderSeq) return;
      pendingMounts.length = 0;
      dom.list.replaceChildren(...notes.map(note => buildItem(note, new Set(attachments.filter(a => a.note_id === note.id).map(a => a.kind)))));
      for (const mount of pendingMounts.splice(0)) void mount().catch(() => notify('Düzenleyici yüklenemedi.', 'error'));
      imageObserver?.disconnect();
      imageObserver = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement; imageObserver?.unobserve(img);
          imageQueue = imageQueue.then(async () => {
            if (seq !== renderSeq) return;
            const image = await repo.getImage(Number(img.dataset.noteImage));
            if (!image || seq !== renderSeq) return;
            img.src = image.data_url; img.addEventListener('click', () => { void fetch(image.data_url).then(r => r.blob()).then(blob => { const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); }); });
          }).catch(() => {});
        }
      });
      dom.list.querySelectorAll<HTMLImageElement>('img[data-note-image]').forEach(img => imageObserver?.observe(img));
      dom.list.hidden = notes.length === 0;
      dom.empty.hidden = notes.length > 0;
      if (notes.length === 0) {
        const key = filter ?? 'all';
        dom.empty.replaceChildren(
          createEmptyState({
            icon: 'notebook-pen',
            title: query ? 'Aramanla eşleşen not yok.' : EMPTY_TITLES[key] ?? `${labelOf(key)} kategorisinde henüz kayıt yok.`,
            hint: EMPTY_HINT
          })
        );
      }
    } catch {
      if (seq !== renderSeq) return;
      notify('Notlar yüklenemedi. Eklentiyi yeniden açmayı dene.', 'error');
    }
  }

  dom.editorHost.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      dom.form.requestSubmit();
    }
  });

  dom.form.addEventListener('submit', event => {
    event.preventDefault();
    void (async () => {
      const text = addEditor?.getMarkdown().trim() ?? '';
      if (!text) {
        notify('Kaydedilecek bir metin yaz.', 'error');
        addEditor?.focus();
        return;
      }
      const category = categories.some(c => c.id === dom.category.value) ? dom.category.value : DEFAULT_CATEGORY;
      dom.save.disabled = true;
      try {
        const { duplicate } = await repo.addNote({ category, text });
        addEditor?.clearDraft();
        dom.form.hidden = true;
        destroyAddEditor();
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
    shown = LIST_LIMIT;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void render();
    }, SEARCH_DEBOUNCE_MS);
  });

  return { render, openNewForm: () => toggleNewForm(true) };
}
