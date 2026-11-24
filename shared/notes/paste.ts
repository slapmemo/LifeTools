// Yapıştırma temizliği (madde 30): kalın, eğik, başlık, liste, bağlantı, tablo kalır; yazı tipi, boyut,
// renk, arka plan, sınıf ve satır içi biçimler atılır. Ctrl+Shift+V (düz metin) ProseMirror'ın kendi işidir.

const KEEP_ATTRS: Record<string, string[]> = {
  A: ['href'],
  TD: ['colspan', 'rowspan'],
  TH: ['colspan', 'rowspan'],
  OL: ['start'],
};

// İçerik korunur, etiketin kendisi atılır.
const UNWRAP = new Set(['SPAN', 'FONT', 'U', 'MARK', 'SUP', 'SUB', 'SMALL', 'BIG', 'CENTER', 'LABEL', 'O:P', 'COLGROUP', 'COL']);
// İçeriğiyle birlikte atılır.
const DROP = new Set(['STYLE', 'SCRIPT', 'META', 'LINK', 'TITLE', 'HEAD', 'IMG', 'SVG', 'IFRAME', 'OBJECT', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'NOSCRIPT']);

function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

/** Word / Google Docs `<span style="font-weight:700">` kalın/eğik bilgisini etiketlere taşır. */
function semanticFromStyle(el: HTMLElement, doc: Document): void {
  const style = el.getAttribute('style') ?? '';
  if (!style) return;
  const weight = /font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(style);
  const italic = /font-style\s*:\s*italic/i.test(style);
  const strike = /text-decoration[^;]*line-through/i.test(style);
  if (!weight && !italic && !strike) return;
  let inner: Node[] = Array.from(el.childNodes);
  const wrap = (tag: string): void => {
    const w = doc.createElement(tag);
    for (const n of inner) w.appendChild(n);
    inner = [w];
  };
  if (strike) wrap('s');
  if (italic) wrap('em');
  if (weight) wrap('strong');
  for (const n of inner) el.appendChild(n);
}

/** `transformPastedHTML` için: yapıştırılan HTML'i temizlenmiş HTML olarak verir. */
export function cleanPastedHtml(html: string): string {
  // Kendi düzenleyicimizden kopyalanan parça (data-pm-slice) zaten şemaya uygundur.
  if (/data-pm-slice=/.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (!el.isConnected) continue;
    if (DROP.has(el.tagName.toUpperCase())) { el.remove(); continue; }
    // Google Docs bütün parçayı <b style="font-weight:normal" id="docs-internal-guid-..."> içine sarar.
    if (el.tagName === 'B' && /font-weight\s*:\s*normal/i.test(el.getAttribute('style') ?? '')) { unwrap(el); continue; }
    semanticFromStyle(el as HTMLElement, doc);
  }
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    if (!el.isConnected) continue;
    if (UNWRAP.has(el.tagName.toUpperCase())) { unwrap(el); continue; }
    const keep = KEEP_ATTRS[el.tagName.toUpperCase()] ?? [];
    for (const name of el.getAttributeNames()) if (!keep.includes(name)) el.removeAttribute(name);
  }
  return doc.body.innerHTML;
}
