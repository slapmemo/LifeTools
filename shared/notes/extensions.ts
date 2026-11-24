// Düzenleyicinin TipTap uzantıları: StarterKit + LifeTools ekleri (altı çizili, vurgu, renk, not bağlantısı, görsel).
// Şema buradan çıkar; markdown.ts de aynı şemayı kullanır.

import { Mark, Node, Extension, markInputRule, markPasteRule, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { RENK_ADLARI, RENK_SINIFI, type RenkAdi } from './mdit';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    ltUnderline: {
      toggleUnderline: () => ReturnType;
      setUnderline: () => ReturnType;
      unsetUnderline: () => ReturnType;
    };
    ltColor: {
      setColor: (color: RenkAdi) => ReturnType;
      unsetColor: () => ReturnType;
    };
    ltNoteLink: {
      insertNoteLink: (attrs: { id: number; title: string }) => ReturnType;
    };
  }
}

/** Altı çizili: `++metin++`, Ctrl+U. */
export const LtUnderline = Mark.create({
  name: 'underline',
  parseHTML() {
    return [{ tag: 'u' }, { style: 'text-decoration', consuming: false, getAttrs: (v) => (typeof v === 'string' && v.includes('underline') ? null : false) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['u', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setUnderline: () => ({ commands }) => commands.setMark(this.name),
      toggleUnderline: () => ({ commands }) => commands.toggleMark(this.name),
      unsetUnderline: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-u': () => this.editor.commands.toggleUnderline(), 'Mod-U': () => this.editor.commands.toggleUnderline() };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|[\s(])(\+\+(?!\s)([^+\n]+?)\+\+)$/, type: this.type })];
  },
  addPasteRules() {
    return [markPasteRule({ find: /(?:^|[\s(])(\+\+(?!\s)([^+\n]+?)\+\+)/g, type: this.type })];
  },
});

/** Yazı rengi: palet adı olarak saklanır (`{kırmızı|metin}`), temaya göre CSS ile boyanır. */
export const LtColor = Mark.create({
  name: 'ltColor',
  // Yüksek öncelik = en dış işaret: `{mavi|**kalın**}` (kalın renkin içinde).
  priority: 1100,
  addAttributes() {
    return {
      color: {
        default: 'gri',
        parseHTML: (el) => el.getAttribute('data-lt-color'),
        renderHTML: (attrs) => ({ 'data-lt-color': attrs.color, class: `md-color md-color-${RENK_SINIFI[attrs.color as RenkAdi] ?? 'gri'}` }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-lt-color]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setColor: (color) => ({ commands }) => (RENK_ADLARI.includes(color) ? commands.setMark(this.name, { color }) : false),
      unsetColor: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

/** Notlar arası bağlantı: `[[Başlık]](lt-note:42)`. Tek parça (atom) satır içi düğüm. */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-note-id')) || 0 },
      title: { default: '', parseHTML: (el) => el.textContent ?? '' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-note-id]' }];
  },
  renderHTML({ node }) {
    return ['span', { 'data-note-id': String(node.attrs.id), class: 'md-note-link' }, node.attrs.title];
  },
  addCommands() {
    return {
      insertNoteLink: (attrs) => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** Görsel: `![](lt-img:7 =320)`. Şimdilik yalnız yer tutucu çizilir. */
export const LtImage = Node.create({
  name: 'ltImage',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-img-id')) || 0 },
      width: { default: null, parseHTML: (el) => Number(el.getAttribute('data-width')) || null },
      alt: { default: '', parseHTML: (el) => el.getAttribute('data-alt') ?? '' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-img-id]' }];
  },
  renderHTML({ node }) {
    const attrs: Record<string, string> = { 'data-img-id': String(node.attrs.id), class: 'md-img-ph' };
    if (node.attrs.width) attrs['data-width'] = String(node.attrs.width);
    if (node.attrs.alt) attrs['data-alt'] = node.attrs.alt;
    return ['span', attrs, `[görsel ${node.attrs.id}]`];
  },
});

/** `[] ` yazınca yapılacak maddesi (TipTap'in kendi kuralı `[ ] ` ister). */
const TaskBracketRule = Extension.create({
  name: 'taskBracketRule',
  addInputRules() {
    const type = this.editor.schema.nodes.taskItem;
    return type ? [wrappingInputRule({ find: /^\s*\[\]\s$/, type, getAttributes: () => ({ checked: false }) })] : [];
  },
});

/** Düzenleyicinin bütün uzantıları; `getSchema(noteExtensions)` Markdown dönüşümünün şemasıdır. */
export function createNoteExtensions(options: { placeholder?: string } = {}) {
  void options;
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      underline: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener noreferrer', class: 'md-link' } },
    }),
    LtUnderline,
    Highlight.configure({ multicolor: false, HTMLAttributes: { class: 'md-mark' } }),
    LtColor,
    TaskList,
    TaskItem.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          // Kaynak metindeki satır (yalnız çizici/ayrıştırıcı için; Markdown'a yazılmaz).
          srcLine: { default: null, rendered: false },
        };
      },
    }).configure({ nested: true, a11y: { checkboxLabel: (node) => `Yapıldı: ${node.textContent || 'boş madde'}` } }),
    TableKit.configure({ table: { resizable: false } }),
    NoteLink,
    LtImage,
    TaskBracketRule,
  ];
}

export const noteExtensions = createNoteExtensions();
