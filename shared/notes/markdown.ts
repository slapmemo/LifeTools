// Markdown <-> ProseMirror belgesi. Ayrıştırma mdit.ts'teki markdown-it ayarıyla, yazma prosemirror-markdown
// serileştiricisiyle ve LifeTools eklerine özel kurallarla yapılır. Biçim: docs/not-bicimi.md

import { getSchema } from '@tiptap/core';
import type { Mark, Node as PMNode, Schema } from '@tiptap/pm/model';
import { MarkdownParser, MarkdownSerializer, MarkdownSerializerState } from 'prosemirror-markdown';
import type MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { noteExtensions } from './extensions';
import { BOSLUK, MAX_BOS_SATIR, RENK_ADLARI, getMd, prepareSource } from './mdit';

export const noteSchema: Schema = getSchema(noteExtensions);

// ---------------------------------------------------------------------------------------------
// Ayrıştırma

/** Tablo hücrelerine paragraf sarar, kısa satırları boş hücreyle tamamlar (TipTap hücresi blok ister). */
function wrapTableCells(tokens: Token[], TokenCtor: new (type: string, tag: string, nesting: 1 | 0 | -1) => Token): Token[] {
  const mk = (type: string, tag: string, n: 1 | 0 | -1): Token => new TokenCtor(type, tag, n);
  const cell = (type: 'th' | 'td'): Token[] => {
    const inline = mk('inline', '', 0);
    inline.children = [];
    return [mk(`${type}_open`, type, 1), mk('paragraph_open', 'p', 1), inline, mk('paragraph_close', 'p', -1), mk(`${type}_close`, type, -1)];
  };
  const out: Token[] = [];
  let cols = 0;
  let inTable = false;
  let rowCells = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === 'table_open') { inTable = true; cols = 0; }
    if (t.type === 'table_close') inTable = false;
    if (inTable && t.type === 'tr_open') rowCells = 0;
    if (inTable && t.type === 'tr_close') {
      // İlk satırın hücre sayısı tablo genişliğidir.
      if (cols === 0) cols = rowCells;
      for (; rowCells < cols; rowCells++) out.push(...cell(tokens[i - 1]?.type === 'th_close' ? 'th' : 'td'));
    }
    if (inTable && (t.type === 'th_open' || t.type === 'td_open')) rowCells++;
    out.push(t);
    if (inTable && (t.type === 'th_open' || t.type === 'td_open')) out.push(mk('paragraph_open', 'p', 1));
    if (inTable && (t.type === 'th_close' || t.type === 'td_close')) {
      // paragraph_close, kapanıştan önce gelmeli
      out.splice(out.length - 1, 0, mk('paragraph_close', 'p', -1));
    }
  }
  return out;
}

function buildParser(): MarkdownParser {
  const md = getMd();
  // prosemirror-markdown yalnız `parse(text, env)` çağırır; araya kendi hazırlığımızı sokan bir sarmal veriyoruz.
  const shim = Object.create(md) as MarkdownIt;
  shim.parse = (text: string) => {
    const { text: prepared } = prepareSource(text);
    const tokens = md.parse(prepared, {});
    // Dış görseller (`![](https://…)`) desteklenmez: yazı olarak kalır, kaybolmaz.
    for (const t of tokens) {
      t.children?.forEach((c) => {
        if (c.type !== 'image') return;
        c.type = 'text';
        c.content = `![${c.content}](${c.attrGet('src') ?? ''})`;
        c.children = null;
      });
    }
    const TokenCtor = tokens[0]?.constructor as new (type: string, tag: string, nesting: 1 | 0 | -1) => Token;
    return TokenCtor ? wrapTableCells(tokens, TokenCtor) : tokens;
  };
  // Çekirdek durumdaki Token sınıfı belirteç yokken de gerekebilir; boş belgede tablo yoktur.
  return new MarkdownParser(noteSchema, shim, {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'listItem' },
    bullet_list: { block: 'bulletList' },
    ordered_list: { block: 'orderedList', getAttrs: (t) => ({ start: Number(t.attrGet('start') ?? 1) }) },
    task_list: { block: 'taskList' },
    task_item: { block: 'taskItem', getAttrs: (t) => ({ checked: !!t.meta?.checked, srcLine: t.meta?.line ?? null }) },
    heading: { block: 'heading', getAttrs: (t) => ({ level: Number(t.tag.slice(1)) }) },
    code_block: { block: 'codeBlock', noCloseToken: true },
    fence: { block: 'codeBlock', getAttrs: (t) => ({ language: t.info.trim() || null }), noCloseToken: true },
    hr: { node: 'horizontalRule' },
    lt_img: { node: 'ltImage', getAttrs: (t) => ({ id: t.meta.id, width: t.meta.width, alt: t.meta.alt }) },
    lt_note: { node: 'noteLink', getAttrs: (t) => ({ id: t.meta.id, title: t.meta.title }) },
    hardbreak: { node: 'hardBreak' },
    softbreak: { node: 'hardBreak' },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    s: { mark: 'strike' },
    ins: { mark: 'underline' },
    mark: { mark: 'highlight' },
    lt_color: { mark: 'ltColor', getAttrs: (t) => ({ color: t.attrGet('color') }) },
    link: { mark: 'link', getAttrs: (t) => ({ href: t.attrGet('href'), title: t.attrGet('title') || null }) },
    code_inline: { mark: 'code', noCloseToken: true },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'tableRow' },
    th: { block: 'tableHeader' },
    td: { block: 'tableCell' },
  });
}

let parser: MarkdownParser | null = null;

/** Markdown metnini düzenleyici belgesine çevirir. */
export function markdownToDoc(text: string): PMNode {
  parser ??= buildParser();
  return parser.parse(text);
}

// ---------------------------------------------------------------------------------------------
// Yazma

const START_ESC = [
  [/^(\s*)(#{1,6})(?=\s|$)/, '$1\\$2'],
  [/^(\s*)([-+])(?=\s|$)/, '$1\\$2'],
  [/^(\s*)(>)/, '$1\\$2'],
  [/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3'],
  [/^(\s*)(-{3,}|_{3,}|\*{3,})\s*$/, '$1\\$2'],
] as const;

const COLOR_OPEN_TEXT = new RegExp(`\\{(?=(?:${RENK_ADLARI.join('|')})\\|)`, 'g');

/** Düz metni Markdown'da başka bir şeye dönüşmeyecek hâle getirir (olabildiğince az kaçışla). */
function escapeText(text: string, startOfLine: boolean, inColor: boolean): string {
  // Ters eğik çizgi yalnız kendinden sonra gelen işareti kaçışa çevirecekse (ya da satır sonundaysa) ikilenir.
  let s = text.replace(/\\(?=[!-/:-@[-`{-~]|$)/g, '\\\\').replace(/[`*[\]]/g, '\\$&');
  s = s.replace(/_/g, (m, i: number) => (i > 0 && i + 1 < s.length && /\w/.test(s[i - 1]) && /\w/.test(s[i + 1]) ? m : '\\_'));
  s = s.replace(/~~+/g, (m) => m.replace(/~/g, '\\~'));
  s = s.replace(/\+\+/g, '\\+\\+').replace(/==/g, '\\=\\=');
  s = s.replace(COLOR_OPEN_TEXT, '\\{');
  if (inColor) s = s.replace(/}/g, '\\}');
  if (startOfLine) for (const [re, rep] of START_ESC) s = s.replace(re, rep);
  return s;
}

function backticksFor(node: PMNode, side: -1 | 1): string {
  let len = 0;
  if (node.isText) for (const m of node.text!.matchAll(/`+/g)) len = Math.max(len, m[0].length);
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

function isPlainUrl(link: Mark, parent: PMNode, index: number): boolean {
  if (link.attrs.title || !/^\w+:/.test(String(link.attrs.href))) return false;
  const content = parent.child(index);
  if (!content.isText || content.text !== link.attrs.href || content.marks[content.marks.length - 1] !== link) return false;
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks);
}

/** prosemirror-markdown'ın tür bildiriminde olmayan, ama çalışma zamanında bulunan alanlar. */
type State = MarkdownSerializerState & {
  inAutolink?: boolean;
  out: string;
  delim: string;
  atBlockStart: boolean;
  flushClose(size?: number): void;
};

/** Tablo hücresinin satır içi içeriğini tek satır Markdown olarak verir. */
function cellText(state: State, cell: PMNode): string {
  const savedOut = state.out;
  const savedDelim = state.delim;
  state.out = '';
  state.delim = '';
  const parts: string[] = [];
  cell.forEach((block) => {
    if (!block.inlineContent) return;
    state.out = '';
    state.renderInline(block);
    parts.push(state.out);
  });
  state.out = savedOut;
  state.delim = savedDelim;
  return parts.join(' ').replace(/\n/g, ' ').replace(/\|/g, '\\|').trim();
}

const serializer = new MarkdownSerializer(
  {
    paragraph(state, node) {
      if (node.content.size === 0) state.write(BOSLUK);
      else state.renderInline(node);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write('#'.repeat(Number(node.attrs.level) || 1) + ' ');
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    codeBlock(state, node) {
      let fence = '```';
      for (const m of node.textContent.matchAll(/`{3,}/g)) if (m[0].length >= fence.length) fence = '`'.repeat(m[0].length + 1);
      state.write(fence + (node.attrs.language || '') + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write(fence);
      state.closeBlock(node);
    },
    horizontalRule(state, node) {
      state.write('---');
      state.closeBlock(node);
    },
    bulletList(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    orderedList(state, node) {
      const start = Number(node.attrs.start) || 1;
      const width = String(start + node.childCount - 1).length;
      const space = ' '.repeat(width + 2);
      state.renderList(node, space, (i) => {
        const n = String(start + i);
        return ' '.repeat(width - n.length) + n + '. ';
      });
    },
    listItem(state, node) {
      state.renderContent(node);
    },
    taskList(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    taskItem(state, node) {
      state.write(node.attrs.checked ? '[x] ' : '[ ] ');
      state.renderContent(node);
    },
    table(st, node) {
      const state = st as State;
      state.flushClose();
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(cellText(state, cell)));
        rows.push(cells);
      });
      const cols = Math.max(1, ...rows.map((r) => r.length));
      const line = (cells: string[]): string => '| ' + Array.from({ length: cols }, (_, i) => cells[i] ?? '').join(' | ') + ' |';
      const lines = [line(rows[0] ?? []), line(Array.from({ length: cols }, () => '---')), ...rows.slice(1).map(line)];
      lines.forEach((l, i) => {
        state.write(l);
        if (i < lines.length - 1) state.ensureNewLine();
      });
      state.closeBlock(node);
    },
    tableRow() { /* tablo kendi satırlarını yazar */ },
    tableHeader() { /* tablo kendi hücrelerini yazar */ },
    tableCell() { /* tablo kendi hücrelerini yazar */ },
    hardBreak(st) {
      st.write();
      (st as State).out += '\n';
    },
    text(st, node) {
      const state = st as State;
      const s = state;
      if (s.inAutolink) { state.text(node.text!, false); return; }
      const startOfLine = state.atBlockStart || state.out.endsWith('\n');
      const inColor = node.marks.some((m) => m.type.name === 'ltColor');
      state.text(escapeText(node.text!, startOfLine, inColor), false);
    },
    noteLink(state, node) {
      const title = String(node.attrs.title).replace(/[\\[\]]/g, '\\$&').replace(/\n/g, ' ');
      state.write(`[[${title}]](lt-note:${node.attrs.id})`);
    },
    ltImage(state, node) {
      const alt = String(node.attrs.alt ?? '').replace(/[\\[\]]/g, '\\$&');
      state.write(`![${alt}](lt-img:${node.attrs.id}${node.attrs.width ? ` =${node.attrs.width}` : ''})`);
    },
  },
  {
    italic: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    bold: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    underline: { open: '++', close: '++', mixable: true, expelEnclosingWhitespace: true },
    highlight: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
    ltColor: {
      open: (_s, mark) => `{${mark.attrs.color}|`,
      close: '}',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    link: {
      open(state, mark, parent, index) {
        const plain = isPlainUrl(mark, parent, index);
        (state as State).inAutolink = plain;
        return plain ? '' : '[';
      },
      close(state, mark) {
        const plain = (state as State).inAutolink;
        (state as State).inAutolink = undefined;
        return plain ? '' : '](' + String(mark.attrs.href).replace(/[()"\s]/g, (c) => (c === ' ' ? '%20' : '\\' + c)) + (mark.attrs.title ? ` "${String(mark.attrs.title).replace(/"/g, '\\"')}"` : '') + ')';
      },
      mixable: true,
    },
    code: {
      open: (_s, _m, parent, index) => backticksFor(parent.child(index), -1),
      close: (_s, _m, parent, index) => backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
  },
  { tightLists: true } as ConstructorParameters<typeof MarkdownSerializer>[2],
);

/** Düzenleyici belgesini Markdown metnine çevirir. */
export function docToMarkdown(doc: PMNode): string {
  let out = serializer.serialize(doc);
  // Boş paragraf = bir ek boş satır: "A\n\n<işaret>\n\nB" -> "A\n\n\nB"
  out = out.replace(new RegExp(`^(?:${BOSLUK}\\n\\n)+`), '').replace(new RegExp(`(?:\\n\\n${BOSLUK})+$`), '');
  // En çok MAX_BOS_SATIR ardışık boş satır (= MAX_BOS_SATIR-1 boş paragraf)
  out = out.replace(new RegExp(`(?:\\n\\n${BOSLUK}){${MAX_BOS_SATIR},}`, 'g'), `\n\n${BOSLUK}`.repeat(MAX_BOS_SATIR - 1));
  out = out.replace(new RegExp(`\\n\\n${BOSLUK}`, 'g'), '\n');
  out = out.split(BOSLUK).join('');
  return out;
}
