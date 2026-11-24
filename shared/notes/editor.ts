// Word benzeri not düzenleyicisi (TipTap). Henüz hiçbir ekrana bağlı değil; üst çubuk sonraki dalga.
// Kayıt biçimi Markdown'dır (docs/not-bicimi.md). Değiştirilmemiş not özgün metniyle geri verilir.

import { Editor, type AnyExtension } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import type { Node as PMNode } from '@tiptap/pm/model';
import { createNoteExtensions } from './extensions';
import { docToMarkdown, markdownToDoc } from './markdown';
import { cleanPastedHtml } from './paste';
import type { RenkAdi } from './mdit';

export interface NoteEditorOptions {
  markdown?: string;
  /** Belge değiştikçe (yalnız kullanıcı değişikliği) güncel Markdown ile çağrılır. */
  onChange?: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  /** Ek uzantılar (ör. bul/değiştir). */
  extensions?: AnyExtension[];
}

/** Üst çubuk düğmelerinin basılı/etkin durumu. */
export interface ActiveState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  code: boolean;
  link: boolean;
  /** Seçimdeki yazı rengi adı ya da null. */
  color: RenkAdi | null;
  /** 0 = paragraf, 1-6 = başlık düzeyi. */
  heading: number;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  inTable: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface NoteEditor {
  /** Değişmediyse özgün metin, değiştiyse güncel Markdown. */
  getMarkdown(): string;
  /** Belgeyi her zaman yeniden yazar (gidiş-dönüş testleri için). */
  serialize(): string;
  /** Metni yükler; bu bir kullanıcı değişikliği sayılmaz, onChange çağrılmaz. */
  setMarkdown(markdown: string): void;
  focus(): void;
  destroy(): void;
  /** Yüklemeden (ya da markSaved'den) beri belge değişti mi. Yazıp geri alma değişmemiş sayılır. */
  isDirty(): boolean;
  /** Şu anki hâli "kaydedildi" kabul eder. */
  markSaved(): void;
  /** Seçim ya da belge değişince çağrılır (üst çubuğu yenilemek için). Aboneliği bırakan işlev döner. */
  onStateChange(cb: (state: ActiveState) => void): () => void;
  activeState(): ActiveState;
  commands: NoteEditorCommands;
  /** TipTap örneği (gelişmiş kullanım için). */
  readonly editor: Editor;
}

export interface NoteEditorCommands {
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrike(): void;
  toggleHighlight(): void;
  toggleCode(): void;
  setParagraph(): void;
  setHeading(level: 1 | 2 | 3 | 4 | 5 | 6): void;
  toggleBlockquote(): void;
  toggleBulletList(): void;
  toggleOrderedList(): void;
  toggleTaskList(): void;
  /** `null` bağlantıyı kaldırır. */
  setLink(url: string | null): void;
  insertHorizontalRule(): void;
  insertTable(rows?: number, cols?: number): void;
  addRowBefore(): void;
  addRowAfter(): void;
  addColumnBefore(): void;
  addColumnAfter(): void;
  deleteRow(): void;
  deleteColumn(): void;
  deleteTable(): void;
  /** `null` rengi kaldırır. */
  setColor(color: RenkAdi | null): void;
  /** Seçimdeki bütün işaretleri ve blok biçimini temizler. */
  clearFormat(): void;
  insertNoteLink(id: number, title: string): void;
  undo(): void;
  redo(): void;
}

const EMPTY_DOC_MD = '';

export function createNoteEditor(el: HTMLElement, options: NoteEditorOptions = {}): NoteEditor {
  let original = options.markdown ?? EMPTY_DOC_MD;
  let initialDoc: PMNode = markdownToDoc(original);
  let quiet = false;
  const listeners = new Set<(s: ActiveState) => void>();

  const extensions = [
    ...createNoteExtensions(),
    Placeholder.configure({ placeholder: options.placeholder ?? '' }),
    ...(options.extensions ?? []),
  ];

  const editor = new Editor({
    element: el,
    extensions,
    content: initialDoc.toJSON(),
    editable: options.editable ?? true,
    editorProps: {
      transformPastedHTML: cleanPastedHtml,
      attributes: { class: 'md note-editor', spellcheck: 'true', lang: 'tr' },
    },
    onUpdate({ transaction }) {
      if (quiet || !transaction.docChanged) return;
      options.onChange?.(api.getMarkdown());
    },
  });
  initialDoc = editor.state.doc;

  const state = (): ActiveState => {
    const colorAttrs = editor.getAttributes('ltColor') as { color?: RenkAdi };
    let heading = 0;
    for (let l = 1; l <= 6; l++) if (editor.isActive('heading', { level: l })) heading = l;
    return {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      highlight: editor.isActive('highlight'),
      code: editor.isActive('code'),
      link: editor.isActive('link'),
      color: editor.isActive('ltColor') ? (colorAttrs.color ?? null) : null,
      heading,
      blockquote: editor.isActive('blockquote'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      taskList: editor.isActive('taskList'),
      inTable: editor.isActive('table'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    };
  };
  const notify = (): void => {
    if (!listeners.size) return;
    const s = state();
    for (const cb of listeners) cb(s);
  };
  editor.on('transaction', notify);

  const chain = () => editor.chain().focus();

  const commands: NoteEditorCommands = {
    toggleBold: () => void chain().toggleBold().run(),
    toggleItalic: () => void chain().toggleItalic().run(),
    toggleUnderline: () => void chain().toggleUnderline().run(),
    toggleStrike: () => void chain().toggleStrike().run(),
    toggleHighlight: () => void chain().toggleHighlight().run(),
    toggleCode: () => void chain().toggleCode().run(),
    setParagraph: () => void chain().setParagraph().run(),
    setHeading: (level) => void chain().toggleHeading({ level }).run(),
    toggleBlockquote: () => void chain().toggleBlockquote().run(),
    toggleBulletList: () => void chain().toggleBulletList().run(),
    toggleOrderedList: () => void chain().toggleOrderedList().run(),
    toggleTaskList: () => void chain().toggleList('taskList', 'taskItem').run(),
    setLink: (url) => {
      if (!url) void chain().extendMarkRange('link').unsetLink().run();
      else void chain().extendMarkRange('link').setLink({ href: url }).run();
    },
    insertHorizontalRule: () => void chain().setHorizontalRule().run(),
    insertTable: (rows = 3, cols = 3) => void chain().insertTable({ rows, cols, withHeaderRow: true }).run(),
    addRowBefore: () => void chain().addRowBefore().run(),
    addRowAfter: () => void chain().addRowAfter().run(),
    addColumnBefore: () => void chain().addColumnBefore().run(),
    addColumnAfter: () => void chain().addColumnAfter().run(),
    deleteRow: () => void chain().deleteRow().run(),
    deleteColumn: () => void chain().deleteColumn().run(),
    deleteTable: () => void chain().deleteTable().run(),
    setColor: (color) => {
      if (color) void chain().setColor(color).run();
      else void chain().unsetColor().run();
    },
    clearFormat: () => void chain().unsetAllMarks().clearNodes().run(),
    insertNoteLink: (id, title) => void chain().insertNoteLink({ id, title }).run(),
    undo: () => void chain().undo().run(),
    redo: () => void chain().redo().run(),
  };

  const api: NoteEditor = {
    editor,
    commands,
    serialize: () => docToMarkdown(editor.state.doc),
    isDirty: () => !editor.state.doc.eq(initialDoc),
    getMarkdown() {
      return api.isDirty() ? api.serialize() : original;
    },
    setMarkdown(markdown) {
      original = markdown;
      const doc = markdownToDoc(markdown);
      quiet = true;
      try {
        editor.commands.setContent(doc.toJSON(), { emitUpdate: false });
      } finally {
        quiet = false;
      }
      initialDoc = editor.state.doc;
      notify();
    },
    markSaved() {
      original = api.serialize();
      initialDoc = editor.state.doc;
    },
    focus: () => void editor.commands.focus(),
    destroy: () => { listeners.clear(); editor.destroy(); },
    onStateChange(cb) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    activeState: state,
  };
  return api;
}
