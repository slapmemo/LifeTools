// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { findInfo, findMatches, trFold } from '../shared/notes/find';
import { mountNoteEditor, NoteConflictError, type NoteEditorHandle } from '../shared/notes/ui';
import { markdownToDoc } from '../shared/notes/markdown';

const handles: NoteEditorHandle[] = [];
function mount(opts: Parameters<typeof mountNoteEditor>[1] = {}): { h: NoteEditorHandle; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const h = mountNoteEditor(host, opts);
  handles.push(h);
  return { h, host };
}
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  vi.useRealTimers();
  while (handles.length) handles.pop()!.destroy();
  document.body.innerHTML = '';
});
const btn = (host: HTMLElement, title: string): HTMLButtonElement => {
  const b = host.querySelector<HTMLButtonElement>(`[title="${title}"]`);
  if (!b) throw new Error('düğme yok: ' + title);
  return b;
};
const select = (h: NoteEditorHandle, from: number, to: number): void => { h.editor.editor.commands.setTextSelection({ from, to }); };
const click = (el: Element): void => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };

describe('üst çubuk', () => {
  test('düğmeler işaret açıp kapatır, etkin durum yansır', () => {
    const { h, host } = mount({ markdown: 'merhaba dünya' });
    select(h, 1, 8);
    click(btn(host, 'Kalın (Ctrl+B)'));
    expect(h.getMarkdown()).toBe('**merhaba** dünya');
    expect(btn(host, 'Kalın (Ctrl+B)').classList.contains('on')).toBe(true);
    expect(btn(host, 'Kalın (Ctrl+B)').getAttribute('aria-pressed')).toBe('true');
    click(btn(host, 'Kalın (Ctrl+B)'));
    expect(btn(host, 'Kalın (Ctrl+B)').classList.contains('on')).toBe(false);
    click(btn(host, 'Altı çizili (Ctrl+U)'));
    click(btn(host, 'Üstü çizili'));
    click(btn(host, 'Vurgula'));
    expect(h.getMarkdown()).toContain('==');
    expect(h.getMarkdown()).toContain('++');
    expect(h.getMarkdown()).toContain('~~');
  });

  test('renk, paragraf seçici, liste, yapılacak, ayırıcı, tablo', () => {
    const { h, host } = mount({ markdown: 'metin' });
    select(h, 1, 6);
    click(btn(host, 'Kırmızı yazı'));
    expect(h.getMarkdown()).toBe('{kırmızı|metin}');
    expect(btn(host, 'Kırmızı yazı').classList.contains('on')).toBe(true);
    click(btn(host, 'Kırmızı yazı'));
    expect(h.getMarkdown()).toBe('metin');
    const sel = host.querySelector<HTMLSelectElement>('.block-sel')!;
    sel.value = 'h1';
    sel.dispatchEvent(new Event('change'));
    expect(h.getMarkdown()).toBe('# metin');
    expect(sel.value).toBe('h1');
    sel.value = 'q';
    sel.dispatchEvent(new Event('change'));
    expect(h.getMarkdown()).toBe('> metin');
    sel.value = 'p';
    sel.dispatchEvent(new Event('change'));
    expect(h.getMarkdown()).toBe('metin');
    click(btn(host, 'Yapılacak kutucuğu'));
    expect(h.getMarkdown()).toBe('- [ ] metin');
    click(btn(host, 'Yapılacak kutucuğu'));
    click(btn(host, 'Madde listesi'));
    expect(h.getMarkdown()).toBe('- metin');
    click(btn(host, 'Numaralı liste'));
    expect(h.getMarkdown()).toBe('1. metin');
    click(btn(host, 'Numaralı liste'));
    click(btn(host, 'Ayırıcı çizgi'));
    expect(h.getMarkdown()).toContain('---');
    click(btn(host, 'Tablo ekle'));
    expect(host.querySelector('table')).not.toBeNull();
    click(btn(host, 'Biçimi temizle'));
  });

  test('bağlantı: kutu açılır, adres uygulanır, geçersiz adres reddedilir', () => {
    const { h, host } = mount({ markdown: 'site' });
    select(h, 1, 5);
    click(btn(host, 'Bağlantı (Ctrl+K)'));
    const box = host.querySelector<HTMLElement>('.linkbox')!;
    const input = box.querySelector('input')!;
    expect(box.hidden).toBe(false);
    input.value = 'bozuk';
    click(box.querySelector('.primary')!);
    expect(box.hidden).toBe(false);
    input.value = 'https://ornek.com';
    click(box.querySelector('.primary')!);
    expect(box.hidden).toBe(true);
    expect(h.getMarkdown()).toBe('[site](https://ornek.com)');
  });

  test('Ctrl+K bağlantı kutusunu, Ctrl+F bul çubuğunu, Ctrl+H değiştirmeyi açar', () => {
    const { host } = mount({ markdown: 'x' });
    const key = (k: string): void => { host.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true })); };
    key('k');
    expect(host.querySelector<HTMLElement>('.linkbox')!.hidden).toBe(false);
    key('f');
    expect(host.querySelector<HTMLElement>('.findbar')!.hidden).toBe(false);
    expect(host.querySelector<HTMLElement>('.find-row[hidden]')).not.toBeNull();
    key('h');
    expect(host.querySelectorAll('.find-row[hidden]').length).toBe(0);
  });

  test('dar panelde "⋯" düğmesi var ve ikinci grubu açar', () => {
    const { host } = mount({ compact: true });
    expect(host.classList.contains('is-compact')).toBe(true);
    const more = btn(host, 'Daha fazla biçim');
    click(more);
    expect(host.querySelector('.ribbon')!.classList.contains('open')).toBe(true);
  });
});

describe('seçim çubuğu', () => {
  test('boş olmayan seçimde görünür, daralınca gizlenir, düğmeler çalışır', () => {
    const { h, host } = mount({ markdown: 'merhaba dünya' });
    const bubble = host.querySelector<HTMLElement>('.bubble')!;
    expect(bubble.hidden).toBe(true);
    select(h, 1, 8);
    expect(bubble.hidden).toBe(false);
    click(bubble.querySelector('.bb-bold')!);
    expect(h.getMarkdown()).toBe('**merhaba** dünya');
    expect(bubble.querySelector('.bb-bold')!.classList.contains('on')).toBe(true);
    select(h, 3, 3);
    expect(bubble.hidden).toBe(true);
  });

  test('renk düğmesi 6 renkli açılır kutu açar; seçilen renk uygulanır', () => {
    const { h, host } = mount({ markdown: 'merhaba dünya' });
    const bubble = host.querySelector<HTMLElement>('.bubble')!;
    const pop = bubble.querySelector<HTMLElement>('.bb-pop')!;
    select(h, 1, 8);
    expect(pop.hidden).toBe(true);
    click(bubble.querySelector('.bb-color')!);
    expect(pop.hidden).toBe(false);
    expect(pop.querySelectorAll('.bb-swatch').length).toBe(6);
    click(pop.querySelector('[data-color="mavi"]')!);
    expect(h.getMarkdown()).toBe('{mavi|merhaba} dünya');
    expect(pop.hidden).toBe(true);
    expect(bubble.querySelector('.bb-color')!.classList.contains('on')).toBe(true);
  });

  test('düzenleyici odağı kaybedince gizlenir', () => {
    const { h, host } = mount({ markdown: 'merhaba' });
    const bubble = host.querySelector<HTMLElement>('.bubble')!;
    select(h, 1, 4);
    expect(bubble.hidden).toBe(false);
    h.editor.editor.emit('blur', { editor: h.editor.editor, event: new FocusEvent('blur'), transaction: h.editor.editor.state.tr });
    expect(bubble.hidden).toBe(true);
  });
});

describe('tablo menüsü (madde 47)', () => {
  const rows = (host: HTMLElement): number => host.querySelectorAll('tr').length;
  const cols = (host: HTMLElement): number => host.querySelector('tr')!.children.length;
  function menuOn(host: HTMLElement): void {
    const cell = host.querySelector('td')!;
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  }
  const item = (host: HTMLElement, label: string): HTMLButtonElement =>
    [...host.querySelectorAll<HTMLButtonElement>('.ctx-item')].find((b) => b.textContent === label)!;

  test('hücrede sağ tık menüyü açar; satır/sütun ekle-sil, tabloyu sil', () => {
    const { host } = mount({ markdown: '| a | b |\n| --- | --- |\n| 1 | 2 |' });
    const menu = host.querySelector<HTMLElement>('.ctx-menu')!;
    expect(menu.hidden).toBe(true);
    menuOn(host);
    expect(menu.hidden).toBe(false);
    expect(rows(host)).toBe(2);
    click(item(host, 'Alta satır ekle'));
    expect(rows(host)).toBe(3);
    expect(menu.hidden).toBe(true);
    menuOn(host);
    click(item(host, 'Üste satır ekle'));
    expect(rows(host)).toBe(4);
    menuOn(host);
    click(item(host, 'Satırı sil'));
    expect(rows(host)).toBe(3);
    menuOn(host);
    click(item(host, 'Sağa sütun ekle'));
    expect(cols(host)).toBe(3);
    menuOn(host);
    click(item(host, 'Sola sütun ekle'));
    expect(cols(host)).toBe(4);
    menuOn(host);
    click(item(host, 'Sütunu sil'));
    expect(cols(host)).toBe(3);
    menuOn(host);
    click(item(host, 'Tabloyu sil'));
    expect(host.querySelector('table')).toBeNull();
  });

  test('tablo dışında sağ tık menü açmaz', () => {
    const { host } = mount({ markdown: 'düz yazı' });
    host.querySelector('p')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(host.querySelector<HTMLElement>('.ctx-menu')!.hidden).toBe(true);
  });
});

describe('biçim boyacısı (madde 33)', () => {
  test('tek tık: bir sonraki seçime uygular ve kapanır', () => {
    vi.useFakeTimers();
    const { h, host } = mount({ markdown: '**kalın** düz' });
    select(h, 1, 3); // kaynak: kalın
    const paint = btn(host, "Biçim boyacısı (tıkla: bir kez, çift tıkla: Esc'e kadar)");
    click(paint);
    expect(paint.classList.contains('on')).toBe(true);
    select(h, 7, 10); // "düz"
    h.editor.editor.view.dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.runAllTimers();
    expect(h.getMarkdown()).toBe('**kalın** **düz**');
    expect(paint.classList.contains('on')).toBe(false);
  });

  test('boyarken bağlantı silinmez, eski biçim temizlenir', () => {
    vi.useFakeTimers();
    const { h, host } = mount({ markdown: '**kalın** [site](https://a.com) *eğik*' });
    select(h, 1, 3); // kaynak: kalın
    click(btn(host, "Biçim boyacısı (tıkla: bir kez, çift tıkla: Esc'e kadar)"));
    select(h, 7, 11); // "site" (bağlantı)
    h.editor.editor.view.dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.runAllTimers();
    expect(h.getMarkdown()).toContain('[**site**](https://a.com)');
  });

  test('çift tık: yapışkan, Esc kapatır; başlık ve renk de kopyalanır', () => {
    vi.useFakeTimers();
    const { h, host } = mount({ markdown: '# {mavi|Başlık}\n\nbir iki üç' });
    select(h, 1, 4);
    const paint = btn(host, "Biçim boyacısı (tıkla: bir kez, çift tıkla: Esc'e kadar)");
    paint.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(paint.classList.contains('sticky')).toBe(true);
    const doc = h.editor.editor.state.doc;
    let pos = 0;
    doc.descendants((n, p) => { if (n.isText && n.text?.startsWith('bir')) pos = p; });
    select(h, pos, pos + 3);
    h.editor.editor.view.dom.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.runAllTimers();
    expect(h.getMarkdown()).toContain('# {mavi|bir}');
    expect(paint.classList.contains('on')).toBe(true); // hâlâ açık
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(paint.classList.contains('on')).toBe(false);
  });
});

describe('bul ve değiştir (madde 34)', () => {
  test('tr-TR katlama: İ/i ve I/ı eşleşir, I/i eşleşmez', () => {
    expect(trFold('İSTANBUL ISI')).toBe('istanbul ısı');
    const doc = markdownToDoc('İstanbul ve ısı ile ILIK ve ilik');
    expect(findMatches(doc, 'istanbul')).toHaveLength(1);
    expect(findMatches(doc, 'ISI')).toHaveLength(1); // ısı
    expect(findMatches(doc, 'ILIK')).toHaveLength(1); // yalnız ILIK ("ılık" gibi), ilik değil
    expect(findMatches(doc, 'ilik')).toHaveLength(1);
  });

  test('sayaç, ileri/geri (sarar), kapatınca temizlenir', () => {
    const { h, host } = mount({ markdown: 'elma armut elma ayva Elma' });
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    const input = host.querySelector<HTMLInputElement>('.find-in')!;
    input.value = 'ELMA';
    input.dispatchEvent(new Event('input'));
    const count = host.querySelector('.find-count')!;
    expect(count.textContent).toBe('1/3');
    expect(host.querySelectorAll('.find-match').length).toBe(3);
    expect(host.querySelectorAll('.find-current').length).toBe(1);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(count.textContent).toBe('2/3');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    expect(count.textContent).toBe('3/3');
    input.value = 'yok';
    input.dispatchEvent(new Event('input'));
    expect(count.textContent).toBe('Sonuç yok');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(host.querySelector<HTMLElement>('.findbar')!.hidden).toBe(true);
    expect(findInfo(h.editor.editor.view).total).toBe(0);
  });

  test('Değiştir ve Tümünü değiştir', () => {
    const { h, host } = mount({ markdown: 'Işık ışık IŞIK baş' });
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true }));
    const [find, repl] = host.querySelectorAll<HTMLInputElement>('.find-in');
    find.value = 'ışık';
    find.dispatchEvent(new Event('input'));
    expect(host.querySelector('.find-count')!.textContent).toBe('1/3');
    repl.value = 'lamba';
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.find-row .ghost')];
    click(buttons.find((b) => b.textContent === 'Değiştir')!);
    expect(h.getMarkdown()).toBe('lamba ışık IŞIK baş');
    click(buttons.find((b) => b.textContent === 'Tümünü değiştir')!);
    expect(h.getMarkdown()).toBe('lamba lamba lamba baş');
  });
});

describe('altlık ve odak modu (madde 8)', () => {
  test('kelime ve karakter sayısı yazdıkça güncellenir', () => {
    const { h, host } = mount({ markdown: 'bir iki üç' });
    const counter = host.querySelector('.counter')!;
    expect(counter.textContent).toBe('3 kelime · 8 karakter');
    h.editor.editor.commands.insertContentAt(1, 'dört ');
    expect(counter.textContent).toBe('4 kelime · 12 karakter');
  });

  test('odak modu sınıfı, geri çağrı ve Esc', () => {
    const calls: boolean[] = [];
    const { h, host } = mount({ onFocusMode: (on) => calls.push(on) });
    const b = [...host.querySelectorAll<HTMLButtonElement>('.foot-btn')][0];
    click(b);
    expect(host.classList.contains('is-focus')).toBe(true);
    expect(h.isFocusMode()).toBe(true);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(host.classList.contains('is-focus')).toBe(false);
    expect(calls).toEqual([true, false]);
  });
});

describe('otomatik kaydetme (madde 45)', () => {
  const type = (h: NoteEditorHandle, text: string): void => { h.editor.editor.commands.insertContentAt(1, text); };
  const status = (host: HTMLElement): string => host.querySelector('.save-status')!.textContent ?? '';

  test('1,5 sn sonra tek kez kaydeder, durum yazısı değişir', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => {});
    const { h, host } = mount({ markdown: 'a', autosave: true, onSave });
    type(h, 'x');
    await vi.advanceTimersByTimeAsync(1000);
    type(h, 'y'); // sayaç sıfırlanır
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('yxa', { force: false });
    expect(status(host)).toBe('Kaydedildi');
    expect(h.isDirty()).toBe(false);
  });

  test('hata: "Kaydedilemedi —" + tekrar dene düğmesi', async () => {
    vi.useFakeTimers();
    let fail = true;
    const onSave = vi.fn(async () => { if (fail) throw new Error('disk'); });
    const { h, host } = mount({ markdown: 'a', autosave: true, onSave });
    type(h, 'x');
    await vi.advanceTimersByTimeAsync(1600);
    expect(status(host)).toBe('Kaydedilemedi —');
    const retry = host.querySelector<HTMLButtonElement>('.link-btn')!;
    expect(retry.hidden).toBe(false);
    fail = false;
    click(retry);
    await vi.advanceTimersByTimeAsync(10);
    expect(status(host)).toBe('Kaydedildi');
    expect(retry.hidden).toBe(true);
  });

  test('çakışma: çubuk çıkar; Benimkini kaydet zorla kaydeder; Yeniden yükle bildirir', async () => {
    vi.useFakeTimers();
    let conflict = true;
    const onSave = vi.fn(async (_md: string, ctx: { force: boolean }) => { if (conflict && !ctx.force) throw new NoteConflictError(); });
    const choices: string[] = [];
    const { h, host } = mount({ markdown: 'a', autosave: true, onSave, onConflict: (c) => { choices.push(c); } });
    type(h, 'x');
    await vi.advanceTimersByTimeAsync(1600);
    const bar = host.querySelector<HTMLElement>('.conflict-bar')!;
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toContain('Bu not başka yerde değişti');
    click(bar.querySelector('[data-choice="overwrite"]')!);
    await vi.advanceTimersByTimeAsync(10);
    expect(choices).toEqual(['overwrite']);
    expect(onSave).toHaveBeenLastCalledWith('xa', { force: true });
    expect(bar.hidden).toBe(true);
    expect(status(host)).toBe('Kaydedildi');

    conflict = true;
    type(h, 'y');
    await vi.advanceTimersByTimeAsync(1600);
    expect(bar.hidden).toBe(false);
    click(bar.querySelector('[data-choice="reload"]')!);
    await vi.advanceTimersByTimeAsync(10);
    expect(choices).toEqual(['overwrite', 'reload']);
    h.setMarkdown('sunucudaki');
    expect(h.getMarkdown()).toBe('sunucudaki');
    expect(h.isDirty()).toBe(false);
  });

  test('flush bekleyen değişikliği hemen kaydeder', async () => {
    vi.useFakeTimers();
    const onSave = vi.fn(async () => {});
    const { h } = mount({ markdown: 'a', autosave: true, onSave });
    type(h, 'x');
    expect(await h.flush()).toBe(true);
    expect(onSave).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(await h.flush()).toBe(true); // değişiklik yok: yeniden kaydetmez
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('taslak (madde 2)', () => {
  test('yazı taslağa gider, açılışta geri yüklenir, clearDraft siler', () => {
    const a = mount({ draftKey: 'taslak-1' });
    a.h.editor.editor.commands.insertContent('yarım kalan not');
    expect(localStorage.getItem('taslak-1')).toBe('yarım kalan not');
    a.h.destroy();
    handles.pop();
    const b = mount({ draftKey: 'taslak-1' });
    expect(b.h.getMarkdown()).toBe('yarım kalan not');
    expect(b.h.isDirty()).toBe(true);
    b.h.clearDraft();
    expect(localStorage.getItem('taslak-1')).toBeNull();
    expect(b.h.isDirty()).toBe(false);
  });

  test('dolu markdown verilirse taslak ezilmez; boşalan metin taslağı siler', () => {
    localStorage.setItem('t2', 'eski taslak');
    const { h } = mount({ draftKey: 't2', markdown: 'gerçek not' });
    expect(h.getMarkdown()).toBe('gerçek not');
    h.editor.editor.commands.selectAll();
    h.editor.editor.commands.deleteSelection();
    expect(localStorage.getItem('t2')).toBeNull();
  });
});

describe('kurtarma (recoveryKey)', () => {
  test('kaydedilemeyen metin yok edilirken saklanır, yeniden açılınca geri yüklenir ve kayıtla silinir', async () => {
    const failing = vi.fn(async () => { throw new Error('disk dolu'); });
    const a = mount({ markdown: 'eski', autosave: true, onSave: failing, recoveryKey: 'rk1' });
    a.h.editor.editor.commands.insertContentAt(1, 'yeni ');
    expect(await a.h.flush()).toBe(false);
    a.h.destroy();
    handles.splice(handles.indexOf(a.h), 1);
    expect(JSON.parse(localStorage.getItem('rk1')!).markdown).toContain('yeni eski');

    const ok = vi.fn(async () => undefined);
    const b = mount({ markdown: 'eski', autosave: true, onSave: ok, recoveryKey: 'rk1' });
    const bar = b.host.querySelector<HTMLElement>('.recover-bar')!;
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toContain('Kaydedilemeyen değişiklik saklandı');
    click(bar.querySelector('button.primary')!);
    expect(b.h.getMarkdown()).toContain('yeni eski');
    expect(await b.h.flush()).toBe(true);
    expect(ok).toHaveBeenCalled();
    expect(localStorage.getItem('rk1')).toBeNull();
  });

  test('başarıyla kaydedilmiş düzenleyici kurtarma kaydı bırakmaz', async () => {
    const a = mount({ markdown: 'x', autosave: true, onSave: async () => undefined, recoveryKey: 'rk2' });
    a.h.editor.editor.commands.insertContentAt(1, 'y');
    await a.h.flush();
    a.h.destroy();
    handles.splice(handles.indexOf(a.h), 1);
    expect(localStorage.getItem('rk2')).toBeNull();
  });
});
