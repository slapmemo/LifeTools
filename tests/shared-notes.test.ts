// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from 'vitest';
import { createNoteEditor, type NoteEditor } from '../shared/notes/editor';
import { docToMarkdown, markdownToDoc } from '../shared/notes/markdown';
import { cleanPastedHtml } from '../shared/notes/paste';
import { extractTags, renderMarkdown, toggleTaskLine } from '../shared/notes/render';

// docs/not-bicimi.md'deki örneklerle aynı küme. Her biri Markdown -> belge -> Markdown aynı çıkmalı.
export const ORNEKLER: Record<string, string> = {
  paragraf: 'Merhaba dünya',
  'satır sonu': 'ilk satır\nikinci satır\nüçüncü satır',
  'iki paragraf': 'Birinci paragraf\n\nİkinci paragraf',
  'başlık 1': '# Büyük başlık',
  'başlık 2-3': '## Orta başlık\n\n### Küçük başlık',
  kalın: 'Bu **kalın** bir söz',
  eğik: 'Bu *eğik* bir söz',
  'üstü çizili': 'Bu ~~silindi~~ artık',
  'altı çizili': 'Bu ++önemli++ bir söz',
  vurgu: 'Bu ==vurgulu== bir söz',
  kod: 'Komut `npm test` çalışsın',
  'kalın eğik': 'Bu ***ikisi birden*** olsun',
  'renkli yazı': 'Durum: {kırmızı|acil} ve {yeşil|tamam}',
  'tüm renkler': '{kırmızı|a} {mavi|b} {yeşil|c} {turuncu|d} {mor|e} {gri|f}',
  'renk içinde kalın': '{mavi|**kalın mavi**} yazı',
  'madde listesi': '- elma\n- armut\n- ayva',
  'numaralı liste': '1. bir\n2. iki\n3. üç',
  'iç içe liste': '- üst\n  - alt bir\n  - alt iki\n- ikinci üst',
  'yapılacak listesi': '- [ ] süt al\n- [x] ekmek al',
  alıntı: '> Bir alıntı\n> iki satır',
  'kod bloğu': '```ts\nconst a = 1;\n\nconsole.log(a);\n```',
  ayırıcı: 'üst\n\n---\n\nalt',
  bağlantı: 'Bak [örnek site](https://ornek.com/a?b=1) güzel',
  'çıplak adres': 'Adres https://ornek.com/yol_a_b burada',
  tablo: '| Ad | Yaş |\n| --- | --- |\n| Ayşe | 30 |\n| Can | 25 |',
  'tabloda biçim': '| **Ad** | Not |\n| --- | --- |\n| ~~eski~~ | `x` |',
  'not bağlantısı': 'Bkz [[Alışveriş listesi]](lt-note:42) notu',
  görsel: 'Resim ![](lt-img:7) burada',
  'görsel boyutlu': 'Resim ![](lt-img:7 =320) burada',
  'bir boş satır ek': 'A\n\n\nB',
  'iki boş satır ek': 'A\n\n\n\nB',
  'üç boş satır': 'A\n\n\n\n\nB',
  'etiketler': 'Toplantı #iş ve #film_listesi',
  'ters eğik çizgi': String.raw`Yol C:\dizin\dosya ve a\*b`,
  'Türkçe karakterler': 'İstanbul’da şöyle çğüöı ĞÜŞİÖÇ yazıldı',
  'bileşik': '# Plan\n\n- [ ] **önemli** iş {kırmızı|acil}\n- [x] ==bitti==\n\n> alıntı ++altı çizili++\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
};

const editors: NoteEditor[] = [];
function open(markdown: string): NoteEditor {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const e = createNoteEditor(host, { markdown });
  editors.push(e);
  return e;
}
afterEach(() => { while (editors.length) editors.pop()!.destroy(); document.body.innerHTML = ''; });

describe('Markdown gidiş-dönüş (belge katmanı)', () => {
  for (const [ad, md] of Object.entries(ORNEKLER)) {
    test(ad, () => {
      const out = docToMarkdown(markdownToDoc(md));
      if (ad === 'üç boş satır') expect(out).toBe('A\n\n\n\nB'); // üst sınır: 3 boş satır
      else expect(out).toBe(md);
    });
  }
});

describe('Markdown gidiş-dönüş (düzenleyici)', () => {
  for (const [ad, md] of Object.entries(ORNEKLER)) {
    test(ad, () => {
      const e = open(md);
      const out = e.serialize();
      if (ad === 'üç boş satır') expect(out).toBe('A\n\n\n\nB');
      else expect(out).toBe(md);
      expect(e.isDirty()).toBe(false);
      expect(e.getMarkdown()).toBe(md);
    });
  }
});

describe('eski düz notlar değişmez', () => {
  const eski = [
    'tek satır',
    'satır 1\nsatır 2\n\nyeni paragraf\n\n\n\n\n\nçok boşluk',
    'Toplantı #İş ve #film_listesi\n# Başlık değil etiket\nhttps://ornek.com/#bolum a#b',
    'Çok_alt_çizgili_kelime ve 2*3*4 ve a_b_c ve C++ ve i++; j++ ve x == y',
    '    girintili satır\n\t tab\n  iki boşluk',
    '1) birinci\n2) ikinci\n* yıldız\n+ artı',
    '[not] [[çift]] <b>html</b> &amp; {süslü} | boru |',
    'Sonda boş satırlar\n\n\n',
    '\n\nBaşta boş satırlar',
    '- [ ] a\n* [x] b\nnormal\n\n```\nkod  içi\n\n\n\n\nboşluk\n```',
  ];
  for (const md of eski) {
    test(JSON.stringify(md).slice(0, 50), () => {
      const e = open(md);
      expect(e.getMarkdown()).toBe(md);
      expect(e.isDirty()).toBe(false);
    });
  }

  test('yazıp geri alınca değişmemiş sayılır', () => {
    const e = open('merhaba');
    e.editor.commands.insertContent('x');
    expect(e.isDirty()).toBe(true);
    expect(e.getMarkdown()).toBe('xmerhaba');
    e.commands.undo();
    expect(e.isDirty()).toBe(false);
    expect(e.getMarkdown()).toBe('merhaba');
  });

  test('onChange yalnız kullanıcı değişikliğinde çağrılır', () => {
    const calls: string[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const e = createNoteEditor(host, { markdown: 'a', onChange: (m) => calls.push(m) });
    editors.push(e);
    e.setMarkdown('b **c**');
    expect(calls).toEqual([]);
    e.editor.commands.insertContent('!');
    expect(calls.length).toBe(1);
    expect(calls[0]).toBe('b **c!**');
  });

  test('dirty not yeniden yazılınca biçim korunur', () => {
    const e = open('Başlık\nikinci satır #etiket https://a.com/x_y\n\n- [ ] iş');
    e.editor.commands.insertContent('X');
    expect(e.getMarkdown()).toBe('XBaşlık\nikinci satır #etiket https://a.com/x_y\n\n- [ ] iş');
  });
});

describe('düzenleyici komutları ve yazarken biçim', () => {
  test('komutlar Markdown üretir', () => {
    const e = open('kelime');
    e.editor.commands.selectAll();
    e.commands.toggleBold();
    e.commands.setColor('mavi');
    expect(e.getMarkdown()).toBe('{mavi|**kelime**}');
    expect(e.activeState().bold).toBe(true);
    expect(e.activeState().color).toBe('mavi');
    e.commands.clearFormat();
    expect(e.getMarkdown()).toBe('kelime');
    e.commands.setHeading(2);
    expect(e.getMarkdown()).toBe('## kelime');
    expect(e.activeState().heading).toBe(2);
  });

  test('tablo ekleme ve satır/sütun işlemleri', () => {
    const e = open('');
    e.commands.insertTable(2, 2);
    expect(e.activeState().inTable).toBe(true);
    e.commands.addRowAfter();
    e.commands.addColumnAfter();
    expect(e.getMarkdown().split('\n')).toHaveLength(4);
    expect(e.getMarkdown().split('\n')[0]).toBe('|  |  |  |');
    e.commands.deleteColumn();
    e.commands.deleteRow();
    expect(e.getMarkdown().split('\n')).toHaveLength(3);
    e.commands.deleteTable();
    expect(e.activeState().inTable).toBe(false);
  });

  test('yapılacak listesi ve alt çizgi', () => {
    const e = open('iş');
    e.commands.toggleTaskList();
    expect(e.getMarkdown()).toBe('- [ ] iş');
    e.commands.toggleTaskList();
    e.commands.toggleBulletList();
    expect(e.getMarkdown()).toBe('- iş');
  });

  test('yazarken kuralları (madde 31)', () => {
    const cases: Array<[string, string]> = [
      ['# ', '# '], ['- ', '- '], ['1. ', '1. '], ['> ', '> '],
    ];
    // Giriş kuralları gerçek tuş vuruşuyla çalışır; handleTextInput üzerinden deneriz.
    const type = (e: NoteEditor, text: string): void => {
      for (const ch of text) {
        const { from, to } = e.editor.state.selection;
        const handled = e.editor.view.someProp('handleTextInput', (f) => f(e.editor.view, from, to, ch, () => e.editor.state.tr.insertText(ch, from, to)));
        if (!handled) e.editor.view.dispatch(e.editor.state.tr.insertText(ch, from, to));
      }
    };
    void cases;
    const run = (typed: string): string => { const e = open(''); e.focus(); type(e, typed); return e.serialize(); };
    expect(run('# baş')).toBe('# baş');
    expect(run('## baş')).toBe('## baş');
    expect(run('- elma')).toBe('- elma');
    expect(run('1. bir')).toBe('1. bir');
    expect(run('> alıntı')).toBe('> alıntı');
    expect(run('[] iş')).toBe('- [ ] iş');
    expect(run('[ ] iş')).toBe('- [ ] iş');
    expect(run('**kalın** x')).toBe('**kalın** x');
    expect(run('*eğik* x')).toBe('*eğik* x');
    expect(run('`kod` x')).toBe('`kod` x');
    expect(run('==vurgu== x')).toBe('==vurgu== x');
    expect(run('~~sil~~ x')).toBe('~~sil~~ x');
    expect(run('++altı++ x')).toBe('++altı++ x');
    expect(run('a')).toBe('a');
    const e = open(''); type(e, '---');
    // `---` ayırıcıyı hemen kurar (üçüncü tireden sonra)
    expect(e.serialize()).toContain('---');
    expect(e.editor.getJSON().content?.some((n) => n.type === 'horizontalRule')).toBe(true);
  });
});

describe('yapıştırma temizliği (madde 30)', () => {
  test('yazı tipi, boyut, renk, sınıf atılır; kalın, eğik, başlık, liste, bağlantı, tablo kalır', () => {
    const html = '<meta charset="utf-8"><h2 class="x" style="color:red">Başlık</h2>'
      + '<p class="MsoNormal" style="font-family:Arial;font-size:20px;color:#f00;background:#ff0"><font face="Arial" size="5"><b>kalın</b> <i>eğik</i> <span style="font-weight:700">span kalın</span> <a href="https://ornek.com" style="color:blue">bağ</a></font></p>'
      + '<ul><li>bir</li><li>iki</li></ul><table><tr><th>a</th></tr><tr><td style="width:9px">1</td></tr></table>';
    const clean = cleanPastedHtml(html);
    expect(clean).not.toMatch(/style=|class=|<font|<span|color|face|size/);
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    expect(doc.querySelector('h2')?.textContent).toBe('Başlık');
    expect(doc.querySelectorAll('strong,b').length).toBe(2);
    expect(doc.querySelector('em,i')?.textContent).toBe('eğik');
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('https://ornek.com');
    expect(doc.querySelectorAll('li').length).toBe(2);
    expect(doc.querySelectorAll('td,th').length).toBe(2);
  });

  test('Google Docs sarmalayıcısı açılır', () => {
    const clean = cleanPastedHtml('<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700;">Merhaba</span></p></b>');
    expect(clean).toBe('<p><strong>Merhaba</strong></p>');
  });

  test('kendi düzenleyicimizden kopyalanan parça değişmez', () => {
    const html = '<p data-pm-slice="1 1 []"><mark class="md-mark">x</mark></p>';
    expect(cleanPastedHtml(html)).toBe(html);
  });

  test('düzenleyiciye yapıştırınca Markdown olarak temiz gelir', () => {
    const e = open('');
    const html = '<p style="font-family:Arial"><span style="color:red;font-weight:700">Önemli</span> metin <a href="https://ornek.com" class="c">bağ</a></p>';
    e.editor.view.pasteHTML(html);
    expect(e.serialize()).toBe('**Önemli** metin [bağ](https://ornek.com)');
  });
});

describe('çizici', () => {
  const q = (root: HTMLElement, sel: string): Element[] => Array.from(root.querySelectorAll(sel));

  test('bloklar', () => {
    const root = renderMarkdown('# Başlık\n\npara **kalın** *eğik* ~~sil~~ ++alt++ ==vurgu== {kırmızı|renk}\n\n- a\n- b\n\n1. x\n\n> alıntı\n\n---\n\n```\nkod\n```');
    expect(q(root, '.md-h1').length).toBe(1);
    expect(q(root, 'strong,em,s,u,mark.md-mark').length).toBe(5);
    expect(q(root, '.md-color-kirmizi')[0].textContent).toBe('renk');
    expect(q(root, 'ul.md-list > li').length).toBe(2);
    expect(q(root, 'ol.md-list > li').length).toBe(1);
    expect(q(root, 'blockquote.md-quote').length).toBe(1);
    expect(q(root, 'hr').length).toBe(1);
    expect(q(root, 'pre.md-pre')[0].textContent).toBe('kod');
  });

  test('tablo', () => {
    const root = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(q(root, 'table thead th').map((e) => e.textContent)).toEqual(['a', 'b']);
    expect(q(root, 'table tbody td').map((e) => e.textContent)).toEqual(['1', '2']);
  });

  test('boş satır kuralı: N boş satır = N-1 boşluk, en çok 3 boş satır', () => {
    const gaps = (t: string): number => q(renderMarkdown(t), 'p.md-gap').length;
    expect(gaps('A\n\nB')).toBe(0);
    expect(gaps('A\n\n\nB')).toBe(1);
    expect(gaps('A\n\n\n\nB')).toBe(2);
    expect(gaps('A\n\n\n\n\n\n\nB')).toBe(2);
    expect(q(renderMarkdown('A\n\n\nB'), 'p.md-p').length).toBe(3);
  });

  test('tek satır sonu <br>; HTML yorumlanmaz', () => {
    const root = renderMarkdown('a\nb <img src=x onerror=alert(1)>');
    expect(q(root, 'br').length).toBe(1);
    expect(q(root, 'img').length).toBe(0);
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('bağlantılar: yalnız http(s) tıklanır, kancalar çalışır', () => {
    const urls: string[] = [];
    const root = renderMarkdown('[site](https://a.com) ve https://b.com/x_y ve [kötü](javascript:alert(1))', { onOpenUrl: (u) => urls.push(u) });
    const links = q(root, 'a.md-link') as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://a.com', 'https://b.com/x_y']);
    links[0].click();
    links[1].click();
    expect(urls).toEqual(['https://a.com', 'https://b.com/x_y']);
    expect(root.textContent).toContain('kötü');
    expect(q(root, 'a').length).toBe(2);
  });

  test('etiketler tıklanır, başlıkta ve adreste etiket olmaz gibi eski davranış', () => {
    const tags: string[] = [];
    const root = renderMarkdown('Toplantı #İş ve (#film)\nhttps://ornek.com/#bolum a#b', { onTag: (t) => tags.push(t) });
    const buttons = q(root, 'button.md-tag') as HTMLButtonElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(['#İş', '#film']);
    buttons[0].click();
    expect(tags).toEqual(['#iş']);
  });

  test('yapılacak kutucuğu özgün satır numarasını verir (boşluk paragraflarına rağmen)', () => {
    const text = 'Liste\n\n\n\n- [ ] süt\n  * [x] ekmek\nnormal';
    const calls: Array<[number, boolean]> = [];
    const root = renderMarkdown(text, { onToggleTask: (l, c) => calls.push([l, c]) });
    const boxes = q(root, 'input[type=checkbox]') as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[1].checked).toBe(true);
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change'));
    boxes[1].checked = false;
    boxes[1].dispatchEvent(new Event('change'));
    expect(calls).toEqual([[4, true], [5, false]]);
    expect(toggleTaskLine(text, 4, true)).toBe('Liste\n\n\n\n- [x] süt\n  * [x] ekmek\nnormal');
    expect(q(renderMarkdown(text), 'input:disabled')).toHaveLength(2);
  });

  test('not bağlantısı ve görsel yer tutucusu', () => {
    const ids: number[] = [];
    const root = renderMarkdown('Bkz [[Liste]](lt-note:42) ![](lt-img:7 =320)', { onOpenNote: (id) => ids.push(id) });
    const b = q(root, 'button.md-note-link')[0] as HTMLButtonElement;
    expect(b.textContent).toBe('Liste');
    b.click();
    expect(ids).toEqual([42]);
    const ph = q(root, '.md-img-ph')[0];
    expect(ph.getAttribute('data-img-id')).toBe('7');
    expect(ph.getAttribute('data-width')).toBe('320');
  });

  test('extractTags ve toggleTaskLine eski davranışı korur', () => {
    expect(extractTags('Toplantı #İş ve #film_listesi\n# Başlık değil etiket\nhttps://ornek.com/#bolum a#b')).toEqual(['#iş', '#film_listesi']);
    expect(extractTags('#iş tekrar #İŞ')).toEqual(['#iş']);
    expect(extractTags('(#parantez) içinde')).toEqual(['#parantez']);
    const text = 'Liste\n- [ ] süt\n  * [x] ekmek\nnormal satır';
    expect(toggleTaskLine(text, 1, true)).toBe('Liste\n- [x] süt\n  * [x] ekmek\nnormal satır');
    expect(toggleTaskLine(text, 2, false)).toBe('Liste\n- [ ] süt\n  - [ ] ekmek\nnormal satır');
    expect(toggleTaskLine(text, 3, true)).toBe(text);
  });
});
