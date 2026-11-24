// Not düzenleyicisinin arayüz katmanı: üst çubuk, seçim çubuğu, tablo menüsü, biçim boyacısı, bul/değiştir,
// altlık (sayaç, kaydetme durumu, odak modu), otomatik kaydetme ve taslak.
// Ekranlar yalnız `mountNoteEditor` ve `NoteConflictError`'ı kullanır. Stil: shared/notes/notes.css.
// DOM yalnız createElement ile kurulur; kullanıcı metni innerHTML'e girmez.

import { createNoteEditor, type ActiveState, type NoteEditor } from './editor';
import { findClear, findInfo, findReplace, findReplaceAll, findSet, findStep, FindExtension } from './find';
import { RENK_ADLARI, type RenkAdi } from './mdit';

/** Sunucu/veritabanı notun başka yerde değiştiğini söylerse `onSave` bunu fırlatır. */
export class NoteConflictError extends Error {
  constructor(message = 'Bu not başka yerde değişti') {
    super(message);
    this.name = 'NoteConflictError';
  }
}

/** Kaydedilemeyen metnin localStorage'daki kurtarma kaydı (`recoveryKey` seçeneği). */
export interface NoteRecovery { markdown: string; at: number }
export function readRecovery(key: string): NoteRecovery | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<NoteRecovery>;
    return typeof v.markdown === 'string' ? { markdown: v.markdown, at: Number(v.at) || 0 } : null;
  } catch { return null; }
}
export function clearRecovery(key: string): void { try { localStorage.removeItem(key); } catch { /* yok say */ } }

export type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'error';
export type ConflictChoice = 'reload' | 'overwrite';

export interface MountNoteEditorOptions {
  markdown?: string;
  placeholder?: string;
  /** Her kullanıcı değişikliğinde güncel Markdown ile. */
  onChange?: (markdown: string) => void;
  /** Otomatik kaydetme (autosave) için. `force` yalnız "Benimkini kaydet" sonrası true olur. */
  onSave?: (markdown: string, ctx: { force: boolean }) => Promise<void> | void;
  autosave?: boolean;
  /** Son değişiklikten bu kadar ms sonra kaydeder (varsayılan 1500). */
  autosaveDelay?: number;
  /** Verilirse kaydedilmemiş metin localStorage'da tutulur ve açılışta geri yüklenir (yalnız `markdown` boşsa). */
  draftKey?: string;
  /** Verilirse düzenleyici kaydedilmemiş değişiklikle (kayıt başarısız / çakışma / bekleyen) yok edilirken metni bu anahtarla
   *  localStorage'a yazar; aynı anahtarla yeniden açılınca "Kaydedilemeyen değişiklik saklandı — Geri yükle" çubuğu çıkar.
   *  Başarılı kayıtta kayıt silinir. Ev sahibi `readRecovery(key)` ile varlığını da sorabilir. */
  recoveryKey?: string;
  /** Verilirse üst çubuk bir "Biçim" düğmesinin arkasına gizlenir (çok küçük pencereler; seçim çubuğu ve kısayollar çalışır). */
  collapseRibbon?: boolean;
  /** Dar panel: üst çubuğun ikinci satırı "⋯" düğmesinin arkasına girer. */
  compact?: boolean;
  /** Çakışma çubuğundaki seçim. 'overwrite' için ardından `onSave(md, {force:true})` kendiliğinden çağrılır; 'reload' için ev sahibi `setMarkdown` çağırmalı. */
  onConflict?: (choice: ConflictChoice) => void | Promise<void>;
  /** Odak modu açılıp kapanınca (ev sahibi tam ekrana geçebilir / çerçeveyi gizleyebilir). */
  onFocusMode?: (on: boolean) => void;
}

export interface NoteEditorHandle {
  readonly editor: NoteEditor;
  getMarkdown(): string;
  isDirty(): boolean;
  focus(): void;
  destroy(): void;
  /** Altlıktaki durum yazısını elle değiştirir. */
  setStatus(text: string, kind?: SaveStatusKind): void;
  /** Bekleyen değişikliği hemen kaydeder (ev sahibi düzenleyiciyi kapatmadan önce). Kaydedilemediyse false. */
  flush(): Promise<boolean>;
  /** Taslağı siler (ev sahibi notu ekledikten sonra). */
  clearDraft(): void;
  /** Metni dışarıdan yükler ("Yeniden yükle"); kirli sayılmaz, çakışma çubuğu kapanır. */
  setMarkdown(markdown: string): void;
  setFocusMode(on: boolean): void;
  isFocusMode(): boolean;
}

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean> = {},
  ...kids: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c) e.append(c);
  return e;
}

const RENK_ETIKET: Record<RenkAdi, string> = {
  kırmızı: 'Kırmızı', mavi: 'Mavi', yeşil: 'Yeşil', turuncu: 'Turuncu', mor: 'Mor', gri: 'Gri',
};
const RENK_SINIF: Record<RenkAdi, string> = {
  kırmızı: 'kirmizi', mavi: 'mavi', yeşil: 'yesil', turuncu: 'turuncu', mor: 'mor', gri: 'gri',
};

/** Biçim boyacısının kopyaladığı biçim. */
interface PaintFormat {
  bold: boolean; italic: boolean; underline: boolean; strike: boolean; highlight: boolean; code: boolean;
  color: RenkAdi | null;
  /** 0 = paragraf, 1-6 = başlık. */
  heading: number;
  blockquote: boolean;
}

export function mountNoteEditor(container: HTMLElement, opts: MountNoteEditorOptions = {}): NoteEditorHandle {
  const delay = opts.autosaveDelay ?? 1500;
  const autosave = !!(opts.autosave && opts.onSave);
  const cleanups: Array<() => void> = [];
  const listen = <T extends EventTarget>(t: T, type: string, fn: (e: never) => void, capture = false): void => {
    t.addEventListener(type, fn as EventListener, capture);
    cleanups.push(() => t.removeEventListener(type, fn as EventListener, capture));
  };

  // ---------- Taslak ----------
  const readDraft = (): string => {
    if (!opts.draftKey) return '';
    try { return localStorage.getItem(opts.draftKey) ?? ''; } catch { return ''; }
  };
  const writeDraft = (md: string): void => {
    if (!opts.draftKey) return;
    try {
      if (md.trim()) localStorage.setItem(opts.draftKey, md);
      else localStorage.removeItem(opts.draftKey);
    } catch { /* depolama kapalı olabilir */ }
  };
  let draftRestored = false;
  let initialMd = opts.markdown ?? '';
  if (!initialMd.trim()) {
    const d = readDraft();
    if (d.trim()) { initialMd = d; draftRestored = true; }
  }

  // ---------- İskelet ----------
  container.classList.add('note-ui-host');
  if (opts.compact) container.classList.add('is-compact');
  if (opts.collapseRibbon) container.classList.add('rb-collapsed');
  const root = h('div', { class: 'note-ui' });
  const ribbon = h('div', { class: 'ribbon', role: 'toolbar', 'aria-label': 'Biçimlendirme' });
  const linkBox = h('div', { class: 'linkbox', hidden: true });
  const findBar = h('div', { class: 'findbar', hidden: true, role: 'search' });
  const conflictBar = h('div', { class: 'conflict-bar', hidden: true, role: 'alert' });
  const body = h('div', { class: 'note-body-wrap' });
  const editHost = h('div', { class: 'note-edit-host' });
  const footer = h('div', { class: 'edit-foot' });
  body.append(editHost);
  const recoverBar = h('div', { class: 'conflict-bar recover-bar', hidden: true, role: 'status' });
  root.append(ribbon, linkBox, findBar, conflictBar, recoverBar, body, footer);
  container.append(root);

  // ---------- Düzenleyici ----------
  let dirtySinceSave = false;
  const handleChange = (md: string): void => {
    opts.onChange?.(md);
    dirtySinceSave = true;
    writeDraft(md);
    updateCount();
    if (autosave && !conflicted) schedule();
    else if (!autosave) setStatus('', 'idle');
  };
  const note = createNoteEditor(editHost, {
    markdown: initialMd,
    placeholder: opts.placeholder ?? 'Buraya yaz, bir kelimeyi seç ve üstten biçimlendir…',
    onChange: handleChange,
    extensions: [FindExtension],
  });
  const ed = note.editor;
  const view = ed.view;
  const cmd = note.commands;

  // ---------- Düğme yardımcıları ----------
  const noFocusSteal = (b: HTMLElement): void => { b.addEventListener('mousedown', (e) => e.preventDefault()); };
  const btn = (label: Child, title: string, onClick: () => void, extra = ''): HTMLButtonElement => {
    const b = h('button', { class: ('tb ' + extra).trim(), type: 'button', title, 'aria-label': title, 'aria-pressed': 'false' }, label);
    noFocusSteal(b);
    b.addEventListener('click', onClick);
    return b;
  };
  const sep = (): HTMLElement => h('span', { class: 'sep', 'aria-hidden': 'true' });
  const letter = (tag: 'b' | 'i' | 'u' | 's', t: string): HTMLElement => h(tag, {}, t);
  const markV = (): HTMLElement => h('mark', { class: 'md-mark tb-mark' }, 'V');

  const actives: Array<{ b: HTMLElement; on: (s: ActiveState) => boolean }> = [];
  const reg = (b: HTMLButtonElement, on: (s: ActiveState) => boolean): HTMLButtonElement => { actives.push({ b, on }); return b; };

  // Paragraf seçici
  const blockSel = h('select', { class: 'block-sel', 'aria-label': 'Paragraf biçimi', title: 'Paragraf biçimi' });
  const optP = h('option', { value: 'p' }, 'Normal metin');
  const optH1 = h('option', { value: 'h1' }, 'Başlık 1');
  const optH2 = h('option', { value: 'h2' }, 'Başlık 2');
  const optQ = h('option', { value: 'q' }, 'Alıntı');
  const optOther = h('option', { value: 'h-other', hidden: true }, 'Başlık 3+');
  blockSel.append(optP, optH1, optH2, optQ, optOther);
  blockSel.addEventListener('change', () => {
    const v = blockSel.value;
    const s = note.activeState();
    if (s.blockquote && v !== 'q') cmd.toggleBlockquote();
    if (v === 'p') cmd.setParagraph();
    else if (v === 'h1') { if (s.heading !== 1) cmd.setHeading(1); }
    else if (v === 'h2') { if (s.heading !== 2) cmd.setHeading(2); }
    else if (v === 'q') { if (s.heading) cmd.setParagraph(); if (!s.blockquote) cmd.toggleBlockquote(); }
    ed.commands.focus();
  });

  const bK = reg(btn(letter('b', 'K'), 'Kalın (Ctrl+B)', cmd.toggleBold), (s) => s.bold);
  const bE = reg(btn(letter('i', 'E'), 'Eğik (Ctrl+I)', cmd.toggleItalic), (s) => s.italic);
  const bA = reg(btn(letter('u', 'A'), 'Altı çizili (Ctrl+U)', cmd.toggleUnderline), (s) => s.underline);
  const bU = reg(btn(letter('s', 'Ü'), 'Üstü çizili', cmd.toggleStrike), (s) => s.strike);
  const bV = reg(btn(markV(), 'Vurgula', cmd.toggleHighlight), (s) => s.highlight);
  const bCode = reg(btn('</>', 'Kod', cmd.toggleCode, 'tb-mono'), (s) => s.code);

  const swatchBtn = (name: RenkAdi, extra = ''): HTMLButtonElement => {
    const b = btn(h('span', { class: `swatch sw-${RENK_SINIF[name]}` }), `${RENK_ETIKET[name]} yazı`, () => {
      cmd.setColor(note.activeState().color === name ? null : name);
    }, extra);
    b.dataset.color = name;
    return reg(b, (s) => s.color === name);
  };
  const bClear = btn('⌫', 'Biçimi temizle', cmd.clearFormat);

  const bBullet = reg(btn('• Liste', 'Madde listesi', cmd.toggleBulletList), (s) => s.bulletList);
  const bOrdered = reg(btn('1. Liste', 'Numaralı liste', cmd.toggleOrderedList), (s) => s.orderedList);
  const bTask = reg(btn('☐ Yapılacak', 'Yapılacak kutucuğu', cmd.toggleTaskList), (s) => s.taskList);
  const bLink = reg(btn('🔗', 'Bağlantı (Ctrl+K)', () => openLink()), (s) => s.link);
  const bTable = reg(btn('▦ Tablo', 'Tablo ekle', () => cmd.insertTable(3, 3)), (s) => s.inTable);
  const bHr = btn('―', 'Ayırıcı çizgi', cmd.insertHorizontalRule);
  const bPaint = btn('🖌', 'Biçim boyacısı (tıkla: bir kez, çift tıkla: Esc\'e kadar)', () => {}, 'tb-paint');
  const bFind = btn('🔍', 'Bul ve değiştir (Ctrl+F)', () => openFind(false));
  const bMore = btn('⋯', 'Daha fazla biçim', () => {
    const open = ribbon.classList.toggle('open');
    bMore.setAttribute('aria-pressed', String(open));
  }, 'tb-more');

  const extra = h('span', { class: 'rb-extra' }, sep(), bBullet, bOrdered, bTask, bLink, bTable, bHr, sep(), bPaint, bFind);
  ribbon.append(
    blockSel, sep(), bK, bE, bA, bU, bV, bCode, sep(),
    ...RENK_ADLARI.map((n) => swatchBtn(n)), bClear,
    bMore, extra,
  );

  // Etkin durum
  const syncRibbon = (s: ActiveState): void => {
    for (const { b, on } of actives) {
      const v = on(s);
      b.classList.toggle('on', v);
      b.setAttribute('aria-pressed', String(v));
    }
    blockSel.value = s.blockquote ? 'q' : s.heading === 1 ? 'h1' : s.heading === 2 ? 'h2' : s.heading >= 3 ? 'h-other' : 'p';
    if (s.heading >= 3) optOther.textContent = `Başlık ${s.heading}`;
  };
  void [bK, bE, bA, bU, bV, bCode];

  // ---------- Bağlantı kutusu ----------
  const linkInput = h('input', { type: 'url', placeholder: 'https://…', 'aria-label': 'Bağlantı adresi' });
  const linkOk = h('button', { class: 'primary', type: 'button' }, 'Ekle');
  const linkRemove = h('button', { class: 'ghost', type: 'button', hidden: true }, 'Bağlantıyı kaldır');
  const linkCancel = h('button', { class: 'ghost', type: 'button' }, 'Vazgeç');
  linkBox.append(linkInput, linkOk, linkRemove, linkCancel);
  const closeLink = (): void => { linkBox.hidden = true; ed.commands.focus(); };
  function openLink(): void {
    const s = note.activeState();
    const href = s.link ? (ed.getAttributes('link') as { href?: string }).href ?? '' : '';
    linkRemove.hidden = !s.link;
    linkOk.textContent = s.link ? 'Güncelle' : 'Ekle';
    linkBox.hidden = false;
    linkInput.value = href || 'https://';
    linkInput.focus();
    linkInput.select();
  }
  const applyLink = (): void => {
    const url = linkInput.value.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) { linkInput.setAttribute('aria-invalid', 'true'); return; }
    linkInput.removeAttribute('aria-invalid');
    linkBox.hidden = true;
    const s = note.activeState();
    if (view.state.selection.empty && !s.link) {
      ed.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).run();
    } else cmd.setLink(url);
  };
  linkOk.addEventListener('click', applyLink);
  linkRemove.addEventListener('click', () => { linkBox.hidden = true; cmd.setLink(null); });
  linkCancel.addEventListener('click', closeLink);
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLink(); }
  });

  // ---------- Seçim çubuğu ----------
  const bubble = h('div', { class: 'bubble', hidden: true, role: 'toolbar', 'aria-label': 'Seçimi biçimlendir' });
  const bubbleButtons: Array<{ b: HTMLElement; on: (s: ActiveState) => boolean }> = [];
  const bb = (b: HTMLButtonElement, on: (s: ActiveState) => boolean): HTMLButtonElement => { bubbleButtons.push({ b, on }); return b; };
  bubble.append(
    bb(btn(letter('b', 'K'), 'Kalın', cmd.toggleBold, 'bb-bold'), (s) => s.bold),
    bb(btn(letter('i', 'E'), 'Eğik', cmd.toggleItalic, 'bb-italic'), (s) => s.italic),
    bb(btn(letter('u', 'A'), 'Altı çizili', cmd.toggleUnderline, 'bb-underline'), (s) => s.underline),
    bb(btn(letter('s', 'Ü'), 'Üstü çizili', cmd.toggleStrike, 'bb-strike'), (s) => s.strike),
    bb(btn(markV(), 'Vurgula', cmd.toggleHighlight, 'bb-highlight'), (s) => s.highlight),
    bb(btn('🔗', 'Bağlantı', () => openLink(), 'bb-link'), (s) => s.link),
  );
  // Renk: tek düğme, tıklayınca 6 renkli küçük açılır kutu.
  const colorPop = h('div', { class: 'bb-pop', hidden: true, role: 'menu', 'aria-label': 'Yazı rengi' });
  const bbColor = bb(btn(h('span', { class: 'swatch sw-kirmizi' }), 'Yazı rengi', () => { colorPop.hidden = !colorPop.hidden; }, 'bb-color'),
    (s) => s.color !== null);
  for (const n of RENK_ADLARI) {
    const sw = btn(h('span', { class: `swatch sw-${RENK_SINIF[n]}` }), `${RENK_ETIKET[n]} yazı`, () => {
      cmd.setColor(note.activeState().color === n ? null : n);
      colorPop.hidden = true;
    }, 'bb-swatch');
    sw.dataset.color = n;
    bb(sw, (s) => s.color === n);
    colorPop.append(sw);
  }
  bubble.append(bbColor, colorPop);
  container.append(bubble);

  let blurred = false;
  const placeBubble = (): void => {
    const sel = view.state.selection;
    // Bul çubuğu açıkken seçim çubuğu onun üstüne binmesin.
    if (blurred || !findBar.hidden || sel.empty || !ed.isEditable || (sel as { node?: unknown }).node) { bubble.hidden = true; colorPop.hidden = true; return; }
    bubble.hidden = false;
    let a = { left: 0, right: 0, top: 0, bottom: 0 };
    let b = a;
    try { a = view.coordsAtPos(sel.from); b = view.coordsAtPos(sel.to); } catch { /* ölçüm yok (test ortamı) */ }
    const box = container.getBoundingClientRect();
    const w = bubble.offsetWidth, hh = bubble.offsetHeight;
    const midX = (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2;
    const avail = box.width || window.innerWidth;
    let left = midX - box.left - w / 2;
    left = Math.max(8, Math.min(avail - w - 8, left));
    let top = Math.min(a.top, b.top) - box.top - hh - 8;
    if (top < 8) top = Math.max(a.bottom, b.bottom) - box.top + 8; // üstte yer yoksa seçimin altına çevir
    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
  };
  ed.on('focus', () => { blurred = false; });
  ed.on('blur', ({ event }) => {
    const next = (event as FocusEvent).relatedTarget as Node | null;
    if (next && bubble.contains(next)) return;
    blurred = true;
    bubble.hidden = true;
    colorPop.hidden = true;
  });
  listen(window, 'scroll', () => { if (!bubble.hidden) placeBubble(); }, true);
  listen(window, 'resize', () => { if (!bubble.hidden) placeBubble(); });

  // ---------- Tablo bağlam menüsü (madde 47) ----------
  const tableMenu = h('div', { class: 'ctx-menu', hidden: true, role: 'menu', 'aria-label': 'Tablo' });
  const menuItem = (label: string, fn: () => void, danger = false): HTMLButtonElement => {
    const b = h('button', { class: danger ? 'ctx-item danger' : 'ctx-item', type: 'button', role: 'menuitem' }, label);
    noFocusSteal(b);
    b.addEventListener('click', () => { closeMenu(); fn(); });
    return b;
  };
  tableMenu.append(
    menuItem('Üste satır ekle', cmd.addRowBefore),
    menuItem('Alta satır ekle', cmd.addRowAfter),
    menuItem('Sola sütun ekle', cmd.addColumnBefore),
    menuItem('Sağa sütun ekle', cmd.addColumnAfter),
    h('div', { class: 'ctx-sep', role: 'separator' }),
    menuItem('Satırı sil', cmd.deleteRow),
    menuItem('Sütunu sil', cmd.deleteColumn),
    menuItem('Tabloyu sil', cmd.deleteTable, true),
  );
  container.append(tableMenu);
  function closeMenu(): void { tableMenu.hidden = true; }
  listen(view.dom, 'contextmenu', (e: MouseEvent) => {
    const cell = (e.target as HTMLElement | null)?.closest?.('td, th');
    if (!cell || !view.dom.contains(cell)) { closeMenu(); return; }
    e.preventDefault();
    try {
      const pos = view.posAtDOM(cell, 0);
      ed.commands.setTextSelection(Math.min(pos + 1, view.state.doc.content.size));
    } catch { /* konum bulunamadı: mevcut seçimle devam */ }
    ed.commands.focus();
    const box = container.getBoundingClientRect();
    tableMenu.hidden = false;
    const w = tableMenu.offsetWidth, hh = tableMenu.offsetHeight;
    const maxX = (box.width || window.innerWidth) - w - 4;
    tableMenu.style.left = `${Math.max(4, Math.min(maxX, e.clientX - box.left))}px`;
    tableMenu.style.top = `${Math.max(4, Math.min((box.height || window.innerHeight) - hh - 4, e.clientY - box.top))}px`;
  });
  listen(document, 'mousedown', (e: MouseEvent) => {
    if (!tableMenu.hidden && !tableMenu.contains(e.target as Node)) closeMenu();
  }, true);
  listen(document, 'pointerdown', (e: PointerEvent) => {
    if (!tableMenu.hidden && !tableMenu.contains(e.target as Node)) closeMenu();
  }, true);
  // Esc odak nerede olursa olsun menüyü kapatır; pencere odağı kaybedince de kapanır.
  listen(document, 'keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !tableMenu.hidden) { closeMenu(); e.preventDefault(); }
  }, true);
  listen(window, 'blur', () => closeMenu());

  // ---------- Biçim boyacısı (madde 33) ----------
  let painter: PaintFormat | null = null;
  let painterSticky = false;
  let lastPaint = '';
  const syncPainterUi = (): void => {
    const on = !!painter;
    bPaint.classList.toggle('on', on);
    bPaint.classList.toggle('sticky', on && painterSticky);
    bPaint.setAttribute('aria-pressed', String(on));
    container.classList.toggle('is-painting', on);
  };
  const capture = (): PaintFormat => {
    const s = note.activeState();
    return { bold: s.bold, italic: s.italic, underline: s.underline, strike: s.strike, highlight: s.highlight, code: s.code, color: s.color, heading: s.heading, blockquote: s.blockquote };
  };
  const armPainter = (sticky: boolean): void => {
    painter = capture();
    painterSticky = sticky;
    lastPaint = '';
    syncPainterUi();
  };
  const disarmPainter = (): void => { painter = null; painterSticky = false; syncPainterUi(); };
  const paintSelection = (): boolean => {
    const f = painter;
    const { from, to, empty } = view.state.selection;
    if (!f || empty || `${from}-${to}` === lastPaint) return false;
    // unsetAllMarks bağlantıyı da silerdi; yalnız biçim işaretlerini kaldır, bağlantı kalsın.
    let c = ed.chain().focus().command(({ tr, state }) => {
      for (const mt of Object.values(state.schema.marks)) if (mt.name !== 'link') tr.removeMark(from, to, mt);
      return true;
    });
    if (f.bold) c = c.setBold();
    if (f.italic) c = c.setItalic();
    if (f.underline) c = c.setUnderline();
    if (f.strike) c = c.setStrike();
    if (f.highlight) c = c.setHighlight();
    if (f.color) c = c.setColor(f.color);
    if (f.code) c = c.setCode();
    if (f.heading) c = c.setHeading({ level: f.heading as 1 | 2 | 3 | 4 | 5 | 6 });
    else c = c.setParagraph();
    c.run();
    if (f.blockquote && !note.activeState().blockquote) cmd.toggleBlockquote();
    lastPaint = `${from}-${to}`;
    if (!painterSticky) disarmPainter();
    return true;
  };
  bPaint.addEventListener('click', (e) => {
    if (e.detail >= 2) return; // çift tıklamanın ikinci tıkı: dblclick halleder
    if (painter) disarmPainter(); else armPainter(false);
  });
  bPaint.addEventListener('dblclick', () => armPainter(true));
  // Seçim fare ya da Shift+ok ile bitince uygula.
  listen(view.dom, 'mouseup', () => { if (painter) setTimeout(paintSelection, 0); });
  listen(view.dom, 'keyup', (e: KeyboardEvent) => {
    if (painter && e.shiftKey && e.key.startsWith('Arrow')) paintSelection();
  });

  // ---------- Bul / değiştir (madde 34) ----------
  const findInput = h('input', { type: 'search', class: 'find-in', placeholder: 'Bul…', 'aria-label': 'Bul' });
  const findCount = h('span', { class: 'find-count', 'aria-live': 'polite' }, '');
  const fPrev = h('button', { class: 'tb', type: 'button', title: 'Önceki (Shift+Enter)', 'aria-label': 'Önceki' }, '▲');
  const fNext = h('button', { class: 'tb', type: 'button', title: 'Sonraki (Enter)', 'aria-label': 'Sonraki' }, '▼');
  const fClose = h('button', { class: 'tb', type: 'button', title: 'Kapat (Esc)', 'aria-label': 'Kapat' }, '✕');
  const replaceIn = h('input', { type: 'text', class: 'find-in', placeholder: 'Değiştir…', 'aria-label': 'Yerine yazılacak' });
  const rOne = h('button', { class: 'ghost', type: 'button' }, 'Değiştir');
  const rAll = h('button', { class: 'ghost', type: 'button' }, 'Tümünü değiştir');
  const replaceRow = h('div', { class: 'find-row', hidden: true }, replaceIn, rOne, rAll);
  findBar.append(h('div', { class: 'find-row' }, findInput, findCount, fPrev, fNext, fClose), replaceRow);

  const refreshFind = (): void => {
    const i = findInfo(view);
    findCount.textContent = !i.query ? '' : i.total ? `${i.index}/${i.total}` : 'Sonuç yok';
  };
  function openFind(withReplace: boolean): void {
    findBar.hidden = false;
    if (withReplace) replaceRow.hidden = false;
    const { from, to, empty } = view.state.selection;
    if (!empty && to - from < 100) findInput.value = view.state.doc.textBetween(from, to, ' ');
    findInput.focus();
    findInput.select();
    findSet(view, findInput.value);
    refreshFind();
  }
  function closeFind(): void {
    findBar.hidden = true;
    replaceRow.hidden = true;
    findClear(view);
    refreshFind();
    ed.commands.focus();
  }
  findInput.addEventListener('input', () => { findSet(view, findInput.value); refreshFind(); });
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); findStep(view, e.shiftKey ? -1 : 1); refreshFind(); }
  });
  fNext.addEventListener('click', () => { findStep(view, 1); refreshFind(); });
  fPrev.addEventListener('click', () => { findStep(view, -1); refreshFind(); });
  fClose.addEventListener('click', closeFind);
  rOne.addEventListener('click', () => { findReplace(view, replaceIn.value); refreshFind(); });
  rAll.addEventListener('click', () => {
    const n = findReplaceAll(view, replaceIn.value);
    refreshFind();
    setStatus(n ? `${n} yer değiştirildi` : 'Sonuç yok', 'idle');
  });
  replaceIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rOne.click(); } });

  // ---------- Altlık: sayaç, durum, odak modu ----------
  const counter = h('span', { class: 'counter' }, '0 kelime · 0 karakter');
  const statusEl = h('span', { class: 'save-status', 'aria-live': 'polite' });
  const retryBtn = h('button', { class: 'link-btn', type: 'button', hidden: true }, 'tekrar dene');
  const focusBtn = h('button', { class: 'ghost foot-btn', type: 'button', title: 'Odak modu (Esc ile çık)', 'aria-pressed': 'false' }, 'Odak modu');
  const fmtBtn = h('button', { class: 'ghost foot-btn', type: 'button', title: 'Biçim çubuğunu aç/kapat', 'aria-pressed': 'false' }, 'Biçim');
  fmtBtn.addEventListener('click', () => { const on = container.classList.toggle('rb-open'); fmtBtn.setAttribute('aria-pressed', String(on)); });
  footer.append(counter, h('span', { class: 'foot-right' }, statusEl, retryBtn, opts.collapseRibbon ? fmtBtn : null, focusBtn));

  function updateCount(): void {
    const text = ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', ' ');
    const words = (text.match(/\S+/g) ?? []).length;
    counter.textContent = `${words} kelime · ${text.replace(/\s/g, '').length} karakter`;
  }
  let focusMode = false;
  const setFocusMode = (on: boolean): void => {
    if (focusMode === on) return;
    focusMode = on;
    container.classList.toggle('is-focus', on);
    focusBtn.setAttribute('aria-pressed', String(on));
    focusBtn.textContent = on ? 'Odak modundan çık' : 'Odak modu';
    opts.onFocusMode?.(on);
    ed.commands.focus();
  };
  focusBtn.addEventListener('click', () => setFocusMode(!focusMode));

  // ---------- Otomatik kaydetme (madde 45) ----------
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving: Promise<boolean> | null = null;
  let again = false;
  let conflicted = false;
  let failed = false;
  let forceNext = false;

  function setStatus(text: string, kind: SaveStatusKind = 'idle'): void {
    statusEl.textContent = text;
    statusEl.dataset.kind = kind;
    retryBtn.hidden = !(kind === 'error' && !conflicted);
    // Kaydedilemedi yazısı "— tekrar dene" ile biter; düğme aynı satırda durur.
  }
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void save(); }, delay);
  }
  async function save(): Promise<boolean> {
    if (!opts.onSave) return true;
    if (saving) { again = true; return saving; }
    saving = (async () => {
      let ok = true;
      do {
        again = false;
        const docAt = ed.state.doc;
        const md = note.getMarkdown();
        const force = forceNext;
        setStatus('Kaydediliyor…', 'saving');
        try {
          await opts.onSave?.(md, { force });
          forceNext = false;
          failed = false;
          if (ed.state.doc === docAt) { note.markSaved(); dirtySinceSave = false; draftRestored = false; clearDraft(); if (opts.recoveryKey) clearRecovery(opts.recoveryKey); }
          else again = true; // kaydederken yazılmış: bir tur daha
          setStatus('Kaydedildi', 'saved');
        } catch (err) {
          ok = false;
          again = false;
          failed = true;
          if (err instanceof NoteConflictError || (err as Error)?.name === 'NoteConflictError') showConflict();
          else setStatus('Kaydedilemedi —', 'error');
        }
      } while (again);
      return ok;
    })().finally(() => { saving = null; });
    return saving;
  }
  retryBtn.addEventListener('click', () => { void save(); });

  function showConflict(): void {
    conflicted = true;
    setStatus('Kaydedilemedi', 'error');
    conflictBar.replaceChildren(
      h('span', { class: 'conflict-text' }, 'Bu not başka yerde değişti'),
      h('button', { class: 'ghost', type: 'button', 'data-choice': 'reload' }, 'Yeniden yükle'),
      h('button', { class: 'primary', type: 'button', 'data-choice': 'overwrite' }, 'Benimkini kaydet'),
    );
    conflictBar.hidden = false;
    for (const b of Array.from(conflictBar.querySelectorAll('button'))) {
      b.addEventListener('click', async () => {
        const choice = b.getAttribute('data-choice') as ConflictChoice;
        conflictBar.hidden = true;
        conflicted = false;
        await opts.onConflict?.(choice);
        if (choice === 'overwrite') { forceNext = true; await save(); }
      });
    }
  }

  function clearDraft(): void {
    if (!opts.draftKey) return;
    draftRestored = false;
    try { localStorage.removeItem(opts.draftKey); } catch { /* yok say */ }
  }

  // ---------- Kurtarma (kaydedilemeyen metin) ----------
  const stashUnsaved = (): void => {
    if (!opts.recoveryKey) return;
    if (!(dirtySinceSave || failed || conflicted)) return;
    try { localStorage.setItem(opts.recoveryKey, JSON.stringify({ markdown: note.getMarkdown(), at: Date.now() })); } catch { /* yok say */ }
  };
  if (opts.recoveryKey) {
    const rec = readRecovery(opts.recoveryKey);
    if (rec && rec.markdown !== initialMd) {
      const restore = h('button', { class: 'primary', type: 'button' }, 'Geri yükle');
      const drop = h('button', { class: 'ghost', type: 'button' }, 'Sil');
      recoverBar.append(h('span', { class: 'conflict-text' }, 'Kaydedilemeyen değişiklik saklandı —'), restore, drop);
      recoverBar.hidden = false;
      restore.addEventListener('click', () => {
        recoverBar.hidden = true;
        note.setMarkdown(rec.markdown);
        handleChange(rec.markdown); // değişiklik sayılır: otomatik kayıt başlar
        ed.commands.focus();
      });
      drop.addEventListener('click', () => { recoverBar.hidden = true; clearRecovery(opts.recoveryKey!); });
    } else if (rec) clearRecovery(opts.recoveryKey);
  }

  // ---------- Klavye ----------
  listen(container, 'keydown', (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && !e.shiftKey && !e.altKey && k === 'f') { e.preventDefault(); openFind(false); return; }
    if (mod && !e.shiftKey && !e.altKey && k === 'h') { e.preventDefault(); openFind(true); return; }
    if (mod && !e.shiftKey && !e.altKey && k === 'k') { e.preventDefault(); openLink(); return; }
    if (e.key !== 'Escape') return;
    if (!tableMenu.hidden) { closeMenu(); e.preventDefault(); return; }
    if (!findBar.hidden) { e.preventDefault(); closeFind(); return; }
    if (painter) { e.preventDefault(); disarmPainter(); return; }
    if (focusMode) { e.preventDefault(); setFocusMode(false); }
  });

  // ---------- Durum yenileme ----------
  const off = note.onStateChange((s) => {
    syncRibbon(s);
    for (const { b, on } of bubbleButtons) {
      const v = on(s);
      b.classList.toggle('on', v);
      b.setAttribute('aria-pressed', String(v));
    }
    placeBubble();
    if (!findBar.hidden) refreshFind();
  });
  cleanups.push(off);
  syncRibbon(note.activeState());
  updateCount();
  setStatus('', 'idle');

  const handle: NoteEditorHandle = {
    editor: note,
    getMarkdown: () => note.getMarkdown(),
    isDirty: () => note.isDirty() || draftRestored,
    focus: () => note.focus(),
    setStatus,
    clearDraft,
    setFocusMode,
    isFocusMode: () => focusMode,
    setMarkdown(md) {
      note.setMarkdown(md);
      conflicted = false;
      failed = false;
      dirtySinceSave = false;
      conflictBar.hidden = true;
      if (timer) { clearTimeout(timer); timer = null; }
      updateCount();
      setStatus('', 'idle');
    },
    async flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (saving) await saving;
      if (!opts.onSave || conflicted) return !conflicted;
      if (!dirtySinceSave && !failed && !note.isDirty()) return true;
      return save();
    },
    destroy() {
      stashUnsaved();
      if (timer) clearTimeout(timer);
      timer = null;
      for (const c of cleanups.splice(0)) c();
      note.destroy();
      root.remove();
      bubble.remove();
      tableMenu.remove();
      container.classList.remove('note-ui-host', 'is-compact', 'is-focus', 'is-painting');
    },
  };
  return handle;
}
