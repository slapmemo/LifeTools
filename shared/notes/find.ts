// Not içinde bul ve değiştir (madde 34): ProseMirror eklentisi + yardımcı işlevler.
// Eşleşmeler dekorasyonla işaretlenir; belge değişmez. Arama büyük/küçük harfe duyarsızdır (tr-TR: İ/i, I/ı).

import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

export interface FindMatch { from: number; to: number }
interface FindState { query: string; current: number; matches: FindMatch[]; deco: DecorationSet }

export const findKey = new PluginKey<FindState>('ltFind');

/** tr-TR küçük harfe indirger; uzunluğu değiştiren dönüşümleri yok sayar (konumlar kaymasın). */
export function trFold(s: string): string {
  let out = '';
  for (const ch of s) {
    const l = ch.toLocaleLowerCase('tr-TR');
    out += l.length === ch.length ? l : ch;
  }
  return out;
}

/** Belgedeki tüm eşleşmeler (örtüşmeyen), belge konumuyla. */
export function findMatches(doc: PMNode, query: string): FindMatch[] {
  const q = trFold(query);
  if (!q) return [];
  const out: FindMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Yaprak düğümler (satır sonu, görsel) tek karakter sayılır: konumlar 1'e 1 eşleşir.
    const text = trFold(node.textBetween(0, node.content.size, undefined, '￼'));
    let i = text.indexOf(q);
    while (i !== -1) {
      out.push({ from: pos + 1 + i, to: pos + 1 + i + q.length });
      i = text.indexOf(q, i + q.length);
    }
    return false;
  });
  return out;
}

function build(doc: PMNode, query: string, current: number): { matches: FindMatch[]; current: number; deco: DecorationSet } {
  const matches = findMatches(doc, query);
  const cur = matches.length ? Math.max(0, Math.min(current, matches.length - 1)) : 0;
  const deco = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === cur ? 'find-match find-current' : 'find-match' })),
  );
  return { matches, current: cur, deco };
}

export const FindExtension = Extension.create({
  name: 'ltFind',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', current: 0, matches: [], deco: DecorationSet.empty }),
          apply(tr, prev) {
            const meta = tr.getMeta(findKey) as { query?: string; current?: number } | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const b = build(tr.doc, query, meta?.current ?? prev.current);
            return { query, ...b };
          },
        },
        props: { decorations: (state) => findKey.getState(state)?.deco ?? DecorationSet.empty },
      }),
    ];
  },
});

export interface FindInfo { query: string; total: number; /** 1'den; eşleşme yoksa 0 */ index: number }

export function findInfo(view: EditorView): FindInfo {
  const st = findKey.getState(view.state);
  if (!st) return { query: '', total: 0, index: 0 };
  return { query: st.query, total: st.matches.length, index: st.matches.length ? st.current + 1 : 0 };
}

/** Eşleşmeyi seçer ve görünür kılar (odak aranan kutuda kalır). */
function select(view: EditorView, m: FindMatch | undefined, base = view.state.tr): void {
  const tr = base;
  if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  view.dispatch(tr);
}

/** Arama sözcüğünü ayarlar; seçimden sonraki ilk eşleşme geçerli olur. */
export function findSet(view: EditorView, query: string): void {
  const matches = findMatches(view.state.doc, query);
  const from = view.state.selection.from;
  let current = matches.findIndex((m) => m.from >= from);
  if (current < 0) current = 0;
  const tr = view.state.tr.setMeta(findKey, { query, current });
  const m = matches[current];
  if (m) tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();
  view.dispatch(tr);
}

/** Sonraki (+1) / önceki (-1) eşleşme; sondan başa sarar. */
export function findStep(view: EditorView, dir: 1 | -1): void {
  const st = findKey.getState(view.state);
  if (!st || !st.matches.length) return;
  const current = (st.current + dir + st.matches.length) % st.matches.length;
  select(view, st.matches[current], view.state.tr.setMeta(findKey, { current }));
}

export function findClear(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(findKey, { query: '', current: 0 }));
}

/** Geçerli eşleşmeyi değiştirir; bir sonrakine geçer. Değiştirilen sayısını döner (0 ya da 1). */
export function findReplace(view: EditorView, text: string): number {
  const st = findKey.getState(view.state);
  const m = st?.matches[st.current];
  if (!st || !m) return 0;
  const tr = view.state.tr.insertText(text, m.from, m.to);
  view.dispatch(tr);
  const after = findKey.getState(view.state);
  select(view, after?.matches[after.current]);
  return 1;
}

/** Tüm eşleşmeleri tek işlemde değiştirir (tek geri alma adımı). */
export function findReplaceAll(view: EditorView, text: string): number {
  const st = findKey.getState(view.state);
  if (!st || !st.matches.length) return 0;
  const tr = view.state.tr;
  for (let i = st.matches.length - 1; i >= 0; i--) tr.insertText(text, st.matches[i].from, st.matches[i].to);
  view.dispatch(tr);
  return st.matches.length;
}
