// Salt okunur not çizicisi (docs/not-bicimi.md). Düzenleyiciye bağlı değildir: yalnız markdown-it belirteçlerini
// DOM düğümlerine çevirir. innerHTML kullanılmaz; not metnindeki HTML hiçbir zaman yorumlanmaz.
// desktop/src/markdown.ts yerine geçecek; aynı kanca arayüzünü (onToggleTask, onOpenUrl, onTag) korur.

import type Token from 'markdown-it/lib/token.mjs';
import { RENK_ADLARI, RENK_SINIFI, tokenize, type RenkAdi } from './mdit';

export interface MarkdownHooks {
  /** Yapılacak kutucuğu tıklanınca: metindeki satır numarası (0'dan) ve yeni durum. */
  onToggleTask?: (line: number, checked: boolean) => void;
  /** Bağlantı tıklanınca (varsayılan tarayıcıda açmak için). */
  onOpenUrl?: (url: string) => void;
  /** #etiket tıklanınca. */
  onTag?: (tag: string) => void;
  /** Not bağlantısı `[[Başlık]](lt-note:42)` tıklanınca. */
  onOpenNote?: (id: number) => void;
}

const TASK_RE = /^(\s*)[-*] \[( |x|X)\] (.*)$/;
const HEADING_RE = /^(#{1,3}) (.*)$/;
const TAG_RE = /(?<=^|[\s(])#[\p{L}\p{N}_-]+/gu;

/** Metindeki #etiketleri (küçük harfe çevrilmiş, tekrarsız) döndürür. */
export function extractTags(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    if (HEADING_RE.test(line)) continue;
    for (const m of line.matchAll(/(?<=^|[\s(])#([\p{L}\p{N}_-]+)/gu)) out.add('#' + m[1].toLocaleLowerCase('tr-TR'));
  }
  return [...out];
}

/** `line` numaralı yapılacak satırının kutucuğunu değiştirir; satır yapılacak değilse metni aynen döndürür. */
export function toggleTaskLine(text: string, line: number, checked: boolean): string {
  const lines = text.split('\n');
  const m = lines[line]?.match(TASK_RE);
  if (!m) return text;
  lines[line] = `${m[1]}- [${checked ? 'x' : ' '}] ${m[3]}`;
  return lines.join('\n');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

const isWebUrl = (u: string): boolean => /^https?:\/\//i.test(u);

function appendText(parent: Node, text: string, hooks: MarkdownHooks, allowTags: boolean): void {
  if (!allowTags) { parent.appendChild(document.createTextNode(text)); return; }
  let last = 0;
  for (const m of text.matchAll(TAG_RE)) {
    const start = m.index ?? 0;
    if (start > last) parent.appendChild(document.createTextNode(text.slice(last, start)));
    const tag = m[0];
    const b = el('button', 'md-tag');
    b.type = 'button';
    b.title = `${tag} etiketine göre süz`;
    b.textContent = tag;
    b.addEventListener('click', (e) => { e.stopPropagation(); hooks.onTag?.(tag.toLocaleLowerCase('tr-TR')); });
    parent.appendChild(b);
    last = start + tag.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function renderInline(children: Token[], into: Node, hooks: MarkdownHooks): void {
  const stack: Node[] = [into];
  let linkDepth = 0;
  const top = (): Node => stack[stack.length - 1];
  const open = (node: HTMLElement): void => { top().appendChild(node); stack.push(node); };
  const pop = (): void => { if (stack.length > 1) stack.pop(); };

  for (const t of children) {
    switch (t.type) {
      case 'text': appendText(top(), t.content, hooks, linkDepth === 0); break;
      case 'softbreak':
      case 'hardbreak': top().appendChild(el('br')); break;
      case 'code_inline': { const c = el('code', 'md-code'); c.textContent = t.content; top().appendChild(c); break; }
      case 'em_open': open(el('em')); break;
      case 'strong_open': open(el('strong')); break;
      case 's_open': open(el('s')); break;
      case 'ins_open': open(el('u')); break;
      case 'mark_open': open(el('mark', 'md-mark')); break;
      case 'lt_color_open': {
        const name = (t.attrGet('color') ?? 'gri') as RenkAdi;
        const s = el('span', `md-color md-color-${RENK_SINIFI[name] ?? 'gri'}`);
        s.setAttribute('data-color', RENK_ADLARI.includes(name) ? name : 'gri');
        open(s);
        break;
      }
      case 'em_close': case 'strong_close': case 's_close': case 'ins_close': case 'mark_close': case 'lt_color_close': pop(); break;
      case 'link_open': {
        const url = t.attrGet('href') ?? '';
        if (isWebUrl(url)) {
          const a = el('a', 'md-link');
          a.href = url;
          a.title = url;
          a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); hooks.onOpenUrl?.(url); });
          open(a);
        } else open(el('span')); // güvenli olmayan adres: yalnız metin
        linkDepth++;
        break;
      }
      case 'link_close': linkDepth--; pop(); break;
      case 'lt_note': {
        const b = el('button', 'md-note-link');
        b.type = 'button';
        b.textContent = String(t.meta.title);
        b.title = 'Notu aç';
        const id = Number(t.meta.id);
        b.addEventListener('click', (e) => { e.stopPropagation(); hooks.onOpenNote?.(id); });
        top().appendChild(b);
        break;
      }
      case 'lt_img': {
        const s = el('span', 'md-img-ph');
        s.textContent = '[görsel]';
        s.setAttribute('data-img-id', String(t.meta.id));
        if (t.meta.width) s.setAttribute('data-width', String(t.meta.width));
        top().appendChild(s);
        break;
      }
      default: break;
    }
  }
}

/** Metni blok blok çizer. `hooks.onToggleTask` satır numarasını özgün metne göre verir. */
export function renderMarkdown(text: string, hooks: MarkdownHooks = {}): HTMLElement {
  const root = el('div', 'md');
  const { tokens, lineMap } = tokenize(text);
  const stack: HTMLElement[] = [root];
  const closers: Array<HTMLElement | null> = []; // paragraf açılışında gerçekten düğüm açıldı mı
  const top = (): HTMLElement => stack[stack.length - 1];
  const push = (node: HTMLElement): void => { top().appendChild(node); stack.push(node); };

  for (const t of tokens) {
    switch (t.type) {
      case 'paragraph_open': {
        if (t.meta?.gap) { const g = el('p', 'md-p md-gap'); g.appendChild(el('br')); g.setAttribute('aria-hidden', 'true'); top().appendChild(g); closers.push(null); break; }
        if (t.hidden) {
          if (top().classList.contains('md-task')) { const s = el('span'); push(s); closers.push(s); } else closers.push(null);
        } else { const p = el('p', 'md-p'); push(p); closers.push(p); }
        break;
      }
      case 'paragraph_close': { if (closers.pop()) stack.pop(); break; }
      case 'inline': renderInline(t.children ?? [], top(), hooks); break;
      case 'heading_open': push(el('div', `md-h md-h${Math.min(Number(t.tag.slice(1)), 3)}`)); break;
      case 'heading_close': stack.pop(); break;
      case 'blockquote_open': push(el('blockquote', 'md-quote')); break;
      case 'blockquote_close': stack.pop(); break;
      case 'bullet_list_open': push(el('ul', 'md-list')); break;
      case 'ordered_list_open': {
        const ol = el('ol', 'md-list');
        const start = t.attrGet('start');
        if (start) ol.start = Number(start);
        push(ol);
        break;
      }
      case 'task_list_open': push(el('ul', 'md-tasks')); break;
      case 'bullet_list_close': case 'ordered_list_close': case 'task_list_close': stack.pop(); break;
      case 'list_item_open': push(el('li')); break;
      case 'task_item_open': {
        const checked = !!t.meta?.checked;
        const li = el('li', checked ? 'md-task done' : 'md-task');
        const box = el('input');
        box.type = 'checkbox';
        box.checked = checked;
        box.setAttribute('aria-label', 'Yapıldı');
        const src = t.meta?.line;
        const lineNo = typeof src === 'number' ? (lineMap[src] ?? src) : -1;
        box.addEventListener('click', (e) => e.stopPropagation());
        box.addEventListener('change', () => hooks.onToggleTask?.(lineNo, box.checked));
        if (!hooks.onToggleTask) box.disabled = true;
        li.appendChild(box);
        push(li);
        break;
      }
      case 'list_item_close': case 'task_item_close': stack.pop(); break;
      case 'fence': case 'code_block': {
        const pre = el('pre', 'md-pre');
        pre.textContent = t.content.replace(/\n$/, '');
        top().appendChild(pre);
        break;
      }
      case 'hr': top().appendChild(el('hr', 'md-hr')); break;
      case 'table_open': push(el('table', 'md-table')); break;
      case 'thead_open': push(el('thead')); break;
      case 'tbody_open': push(el('tbody')); break;
      case 'tr_open': push(el('tr')); break;
      case 'th_open': push(el('th')); break;
      case 'td_open': push(el('td')); break;
      case 'table_close': case 'thead_close': case 'tbody_close': case 'tr_close': case 'th_close': case 'td_close': stack.pop(); break;
      default: break;
    }
  }
  return root;
}
