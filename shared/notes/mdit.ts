// Not biçiminin (docs/not-bicimi.md) ortak okuyucusu: markdown-it + LifeTools ekleri.
// Hem çizici (render.ts) hem düzenleyicinin Markdown dönüşümü (markdown.ts) aynı belirteçleri kullanır.

import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';

/** Sabit yazı rengi paleti; Markdown'da ad olarak saklanır. */
export const RENK_ADLARI = ['kırmızı', 'mavi', 'yeşil', 'turuncu', 'mor', 'gri'] as const;
export type RenkAdi = (typeof RENK_ADLARI)[number];

/** CSS sınıfı için ASCII karşılığı. */
export const RENK_SINIFI: Record<RenkAdi, string> = {
  kırmızı: 'kirmizi', mavi: 'mavi', yeşil: 'yesil', turuncu: 'turuncu', mor: 'mor', gri: 'gri',
};

/** Ardışık boş satırlar için üst sınır (bkz. docs/not-bicimi.md). */
export const MAX_BOS_SATIR = 3;
/** Fazladan boş satırı taşıyan geçici paragraf işareti (özel kullanım alanı karakteri). */
export const BOSLUK = '';

export interface PreparedSource {
  text: string;
  /** Hazırlanmış metindeki satır numarası -> özgün metindeki satır numarası. */
  lineMap: number[];
}

/**
 * Baştaki/sondaki boş satırları atar; ortadaki N ardışık boş satırı (N≥2) N-1 "boşluk paragrafına"
 * çevirir (en çok MAX_BOS_SATIR-1). Kod çitlerinin içine dokunmaz.
 */
export function prepareSource(input: string): PreparedSource {
  const src = input.replace(/\r\n?/g, '\n').split('\n');
  let a = 0;
  let b = src.length;
  while (a < b && !src[a].trim()) a++;
  while (b > a && !src[b - 1].trim()) b--;
  const out: string[] = [];
  const lineMap: number[] = [];
  let fence = false;
  for (let i = a; i < b;) {
    const line = src[i];
    if (line.trimStart().startsWith('```')) fence = !fence;
    if (!fence && !line.trim()) {
      let j = i;
      while (j < b && !src[j].trim()) j++;
      const n = j - i;
      out.push(''); lineMap.push(i);
      for (let k = 1; k < Math.min(n, MAX_BOS_SATIR); k++) { out.push(BOSLUK, ''); lineMap.push(i + k, i + k); }
      i = j;
      continue;
    }
    out.push(line); lineMap.push(i); i++;
  }
  return { text: out.join('\n'), lineMap };
}

const isWordChar = (c: string | undefined): boolean => !!c && /[\p{L}\p{N}]/u.test(c);

/** `++metin++` / `==metin==` gibi çift işaretli, iç içe biçim alabilen satır içi kural. */
function pairRule(ch: string, type: string): (state: StateInline, silent: boolean) => boolean {
  const code = ch.charCodeAt(0);
  return (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== code || src.charCodeAt(start + 1) !== code) return false;
    const next = src[start + 2];
    if (next === undefined || /\s/.test(next) || next === ch) return false;
    if (start > 0 && isWordChar(src[start - 1])) return false;
    let close = -1;
    for (let i = start + 2; i < state.posMax; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '\n') return false;
      if (c === ch && src[i + 1] === ch && src[i + 2] !== ch && !/\s/.test(src[i - 1]) && !isWordChar(src[i + 2])) { close = i; break; }
    }
    if (close < 0 || close === start + 2) return false;
    if (!silent) {
      const oldMax = state.posMax;
      state.push(`${type}_open`, '', 1);
      state.pos = start + 2;
      state.posMax = close;
      state.md.inline.tokenize(state);
      state.push(`${type}_close`, '', -1);
      state.posMax = oldMax;
    }
    state.pos = close + 2;
    return true;
  };
}

const COLOR_OPEN = new RegExp(`^\\{(${RENK_ADLARI.join('|')})\\|`);

/** `{kırmızı|metin}` */
function colorRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x7b) return false;
  const m = COLOR_OPEN.exec(src.slice(start, start + 12));
  if (!m) return false;
  const contentStart = start + m[0].length;
  let depth = 1;
  let close = -1;
  for (let i = contentStart; i < state.posMax; i++) {
    const c = src[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) { close = i; break; }
  }
  if (close < 0 || close === contentStart) return false;
  if (!silent) {
    const oldMax = state.posMax;
    const open = state.push('lt_color_open', '', 1);
    open.attrSet('color', m[1]);
    state.pos = contentStart;
    state.posMax = close;
    state.md.inline.tokenize(state);
    state.push('lt_color_close', '', -1);
    state.posMax = oldMax;
  }
  state.pos = close + 1;
  return true;
}

/** `![](lt-img:7)` ve `![](lt-img:7 =320)` */
function imgRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x21) return false;
  const m = /^!\[([^\]]*)\]\(lt-img:(\d+)(?: =(\d+))?\)/.exec(state.src.slice(state.pos, state.posMax));
  if (!m) return false;
  if (!silent) {
    const t = state.push('lt_img', '', 0);
    t.meta = { alt: m[1], id: Number(m[2]), width: m[3] ? Number(m[3]) : null };
  }
  state.pos += m[0].length;
  return true;
}

/** `[[Başlık]](lt-note:42)` */
function noteRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x5b || state.src.charCodeAt(state.pos + 1) !== 0x5b) return false;
  const m = /^\[\[((?:[^\]\\]|\\.)+)\]\]\(lt-note:(\d+)\)/.exec(state.src.slice(state.pos, state.posMax));
  if (!m) return false;
  if (!silent) {
    const t = state.push('lt_note', '', 0);
    t.meta = { title: m[1].replace(/\\(.)/g, '$1'), id: Number(m[2]) };
  }
  state.pos += m[0].length;
  return true;
}

const TASK_PREFIX = /^\[( |x|X)\](?: |$)/;

/** Çekirdek kural: `- [ ]` maddelerini yapılacak listesine ayırır, boşluk paragraflarını işaretler. */
function blockRules(state: StateCore): void {
  const tokens = state.tokens;

  // 1) Boşluk paragrafları
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (tokens[i].type === 'paragraph_open' && tokens[i + 1].type === 'inline' && tokens[i + 1].content === BOSLUK && tokens[i + 2].type === 'paragraph_close') {
      tokens[i].meta = { gap: true };
      tokens[i + 1].children = [];
      tokens[i + 1].content = '';
    }
  }

  // 2) Yapılacak maddeleri: önce işaretle (kutucuk metinden çıkar)
  for (let i = 0; i + 2 < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'list_item_open') continue;
    const p = tokens[i + 1];
    const inl = tokens[i + 2];
    if (p.type !== 'paragraph_open' || inl.type !== 'inline') continue;
    const m = TASK_PREFIX.exec(inl.content);
    if (!m) continue;
    t.meta = { task: true, checked: m[1] !== ' ', line: t.map ? t.map[0] : null };
    inl.content = inl.content.slice(m[0].length);
    const first = inl.children?.[0];
    if (first && first.type === 'text') {
      first.content = first.content.replace(TASK_PREFIX, '');
      if (first.content === '') inl.children!.shift();
    }
  }

  // 3) Liste türlerine göre böl / yeniden adlandır
  const out: Token[] = [];
  type Frame = { open: Token; kind: 'task' | 'plain' | null };
  const lists: Frame[] = [];
  const items: boolean[] = [];
  const mk = (type: string, nesting: 1 | -1 | 0, like: Token): Token => {
    const n = new state.Token(type, 'ul', nesting);
    n.level = like.level;
    n.block = true;
    return n;
  };
  for (const t of tokens) {
    if (t.type === 'bullet_list_open') {
      lists.push({ open: t, kind: null });
      out.push(t);
    } else if (t.type === 'bullet_list_close') {
      const f = lists.pop();
      if (f && f.kind === 'task') t.type = 'task_list_close';
      out.push(t);
    } else if (t.type === 'list_item_open' && lists.length) {
      const f = lists[lists.length - 1];
      const kind = t.meta?.task ? 'task' : 'plain';
      if (f.kind === null) {
        f.kind = kind;
        if (kind === 'task') f.open.type = 'task_list_open';
      } else if (f.kind !== kind) {
        out.push(mk(f.kind === 'task' ? 'task_list_close' : 'bullet_list_close', -1, f.open));
        const open = mk(kind === 'task' ? 'task_list_open' : 'bullet_list_open', 1, f.open);
        out.push(open);
        f.open = open;
        f.kind = kind;
      }
      items.push(kind === 'task');
      if (kind === 'task') t.type = 'task_item_open';
      out.push(t);
    } else if (t.type === 'list_item_close' && items.length) {
      if (items.pop()) t.type = 'task_item_close';
      out.push(t);
    } else out.push(t);
  }
  state.tokens = out;
}

let shared: MarkdownIt | null = null;

/** Not biçimi için ayarlanmış markdown-it örneği (tek örnek, paylaşılır). */
export function getMd(): MarkdownIt {
  if (shared) return shared;
  const md = new MarkdownIt('default', { html: false, linkify: true, breaks: false, typographer: false });
  // Eski düz notların bozulmaması için: girintili kod, setext başlık, bağlantı tanımı ve & çözümleme yok.
  md.disable(['code', 'lheading', 'reference', 'entity']);
  md.linkify.set({ fuzzyLink: false, fuzzyEmail: false, fuzzyIP: false });
  md.normalizeLink = (u) => u;
  md.normalizeLinkText = (u) => u;
  md.inline.ruler.before('image', 'lt_img', imgRule);
  md.inline.ruler.before('link', 'lt_note', noteRule);
  md.inline.ruler.before('emphasis', 'lt_ins', pairRule('+', 'ins'));
  md.inline.ruler.before('emphasis', 'lt_mark', pairRule('=', 'mark'));
  md.inline.ruler.before('emphasis', 'lt_color', colorRule);
  md.core.ruler.push('lt_blocks', blockRules);
  shared = md;
  return md;
}

/** Metni hazırlayıp belirteçlere çevirir. */
export function tokenize(text: string): { tokens: Token[]; lineMap: number[] } {
  const { text: prepared, lineMap } = prepareSource(text);
  return { tokens: getMd().parse(prepared, {}), lineMap };
}
