// Not metni için küçük, güvenli Markdown çizici. innerHTML kullanılmaz; her şey DOM düğümüdür,
// bu yüzden not metnindeki HTML hiçbir zaman yorumlanmaz.
//
// Desteklenenler: # / ## / ### başlık, - / * / 1. liste, - [ ] / - [x] yapılacak, > alıntı,
// ``` kod bloğu, `kod`, **kalın**, *eğik* / _eğik_, [metin](https://…), çıplak https:// adresleri, #etiket.

import { h } from './dom';

export interface MarkdownHooks {
  /** Yapılacak kutucuğu tıklanınca: metindeki satır numarası ve yeni durum. */
  onToggleTask?: (line: number, checked: boolean) => void;
  /** Bağlantı tıklanınca (varsayılan tarayıcıda açmak için). */
  onOpenUrl?: (url: string) => void;
  /** #etiket tıklanınca. */
  onTag?: (tag: string) => void;
}

const TASK_RE = /^(\s*)[-*] \[( |x|X)\] (.*)$/;
const BULLET_RE = /^(\s*)[-*] (.*)$/;
const ORDERED_RE = /^(\s*)\d+[.)] (.*)$/;
const HEADING_RE = /^(#{1,3}) (.*)$/;
const QUOTE_RE = /^> ?(.*)$/;

// Sıra önemli: kod önce (içi biçimlenmez), sonra bağlantılar, sonra vurgu.
const INLINE_RE = /(`[^`\n]+`)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|((?<=^|[\s(])#[\p{L}\p{N}_-]+)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|((?<=^|\s)_[^_\s][^_\n]*_(?=$|[\s.,;:!?]))/gu;

/** Metindeki #etiketleri (küçük harfe çevrilmiş, tekrarsız) döndürür. */
export function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    if (HEADING_RE.test(line)) continue;
    for (const m of line.matchAll(/(?<=^|[\s(])#([\p{L}\p{N}_-]+)/gu)) out.add('#' + m[1].toLocaleLowerCase('tr-TR'));
  }
  return [...out];
}

function link(url: string, label: string, hooks: MarkdownHooks): HTMLElement {
  const a = h('a', { href: url, class: 'md-link', title: url }, label);
  a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hooks.onOpenUrl?.(url); });
  return a;
}

export function renderInline(text: string, hooks: MarkdownHooks): DocumentFragment {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    if (start > last) frag.append(text.slice(last, start));
    const [token, code, mdLink, bare, tag, bold, italic, underscore] = m;
    if (code) frag.append(h('code', { class: 'md-code' }, code.slice(1, -1)));
    else if (mdLink) {
      const close = mdLink.indexOf('](');
      frag.append(link(mdLink.slice(close + 2, -1), mdLink.slice(1, close), hooks));
    } else if (bare) frag.append(link(bare, bare, hooks));
    else if (tag) {
      const t = h('button', { type: 'button', class: 'md-tag', title: `${tag} etiketine göre süz` }, tag);
      t.addEventListener('click', (e) => { e.stopPropagation(); hooks.onTag?.(tag.toLocaleLowerCase('tr-TR')); });
      frag.append(t);
    } else if (bold) frag.append(h('strong', {}, renderInline(bold.slice(2, -2), hooks)));
    else if (italic) frag.append(h('em', {}, renderInline(italic.slice(1, -1), hooks)));
    else if (underscore) frag.append(h('em', {}, renderInline(underscore.slice(1, -1), hooks)));
    else frag.append(token);
    last = start + token.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/** Metni blok blok çizer. `hooks.onToggleTask` satır numarasını özgün metne göre verir. */
export function renderMarkdown(text: string, hooks: MarkdownHooks = {}): HTMLElement {
  const root = h('div', { class: 'md' });
  const lines = text.split('\n');
  let list: HTMLElement | null = null;
  let listKind = '';
  let para: HTMLElement | null = null;

  const closeList = (): void => { list = null; listKind = ''; };
  const closePara = (): void => { para = null; };
  const ensureList = (kind: 'ul' | 'ol' | 'tasks'): HTMLElement => {
    if (!list || listKind !== kind) {
      list = h(kind === 'ol' ? 'ol' : 'ul', { class: kind === 'tasks' ? 'md-tasks' : 'md-list' });
      listKind = kind;
      root.append(list);
    }
    return list;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith('```')) {
      closeList(); closePara();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) body.push(lines[i++]);
      root.append(h('pre', { class: 'md-pre' }, body.join('\n')));
      continue;
    }
    if (!line.trim()) { closeList(); closePara(); continue; }

    let m: RegExpMatchArray | null;
    if ((m = line.match(TASK_RE))) {
      closePara();
      const checked = m[2].toLowerCase() === 'x';
      const box = h('input', { type: 'checkbox', checked, 'aria-label': 'Yapıldı' });
      const lineNo = i;
      box.addEventListener('click', (e) => e.stopPropagation());
      box.addEventListener('change', () => hooks.onToggleTask?.(lineNo, box.checked));
      if (!hooks.onToggleTask) box.disabled = true;
      ensureList('tasks').append(h('li', { class: checked ? 'md-task done' : 'md-task' }, box, h('span', {}, renderInline(m[3], hooks))));
      continue;
    }
    if ((m = line.match(BULLET_RE))) { closePara(); ensureList('ul').append(h('li', {}, renderInline(m[2], hooks))); continue; }
    if ((m = line.match(ORDERED_RE))) { closePara(); ensureList('ol').append(h('li', {}, renderInline(m[2], hooks))); continue; }
    closeList();
    if ((m = line.match(HEADING_RE))) { closePara(); root.append(h('div', { class: `md-h md-h${m[1].length}` }, renderInline(m[2], hooks))); continue; }
    if ((m = line.match(QUOTE_RE))) { closePara(); root.append(h('blockquote', { class: 'md-quote' }, renderInline(m[1], hooks))); continue; }
    if (para) para.append(h('br'), renderInline(line, hooks));
    else { para = h('p', { class: 'md-p' }, renderInline(line, hooks)); root.append(para); }
  }
  return root;
}

/** `line` numaralı yapılacak satırının kutucuğunu değiştirir; satır yapılacak değilse metni aynen döndürür. */
export function toggleTaskLine(text: string, line: number, checked: boolean): string {
  const lines = text.split('\n');
  const m = lines[line]?.match(TASK_RE);
  if (!m) return text;
  lines[line] = `${m[1]}- [${checked ? 'x' : ' '}] ${m[3]}`;
  return lines.join('\n');
}
