import { convert, findPriceAt, formatTry, parsePrice, steamFinalAmount, type Price, type Rates } from './rates';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PAGE_THEME } from '../../core/page-theme';
import { CURRENCY_SETTINGS_KEY, loadCurrencySettings } from './settings';
import { priceCandidate } from './hover';

const symbolFor = (currency: string): string => ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', PLN: 'zł' } as Record<string, string>)[currency] ?? currency;
const dateFor = (date: string): string => date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
const ignored = 'input, textarea, [contenteditable]:not([contenteditable="false"]), [data-lifetools-currency], [data-lifetools-currency-tip]';
const steamPage = location.hostname === 'store.steampowered.com' && location.pathname.startsWith('/app/');

export function initHover(): void {
  let enabled = false;
  let revision = 0;
  let request = 0;
  let rates: Rates | null = null;
  let pendingRates: Promise<Rates | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let host: HTMLElement | null = null;
  let selectionShown = false;
  let shownRect: DOMRect | null = null;
  function hide(): void {
    request++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    host?.remove();
    host = null;
    selectionShown = false;
    shownRect = null;
  }
  async function updateEnabled(): Promise<void> {
    const current = ++revision;
    const [settings, moduleEnabled] = await Promise.all([loadCurrencySettings(), isModuleEnabled('currency')]);
    if (current !== revision) return;
    enabled = moduleEnabled && (settings.hoverAllSites || (steamPage && settings.steamInline));
    if (!enabled) hide();
  }
  function getRates(): Promise<Rates | null> {
    if (rates && Date.now() - rates.fetchedAt < 6 * 60 * 60 * 1000) return Promise.resolve(rates);
    if (!pendingRates) pendingRates = (chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Promise<Rates | null>)
      .then(result => { rates = result; return result; }).catch(() => null).finally(() => { pendingRates = null; });
    return pendingRates;
  }
  function show(price: Price, rect: DOMRect, selection: boolean): void {
    const current = ++request;
    shownRect = rect;
    void getRates().then(currentRates => {
      if (!enabled || current !== request || !currentRates) return;
      const value = convert(price, currentRates.perTry);
      if (value === null) return;
      host?.remove();
      host = document.createElement('div');
      host.dataset.lifetoolsCurrencyTip = '';
      host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = document.createElement('style');
      style.textContent = `${PAGE_THEME} .tip { background:var(--lt-surface); color:var(--lt-text); border:1px solid var(--lt-border); border-radius:8px; box-shadow:var(--lt-shadow); padding:7px 10px; white-space:nowrap; } strong { font-weight:700; } .detail { color:var(--lt-muted); font-size:11px; }`;
      const tip = document.createElement('div');
      tip.className = 'tip';
      const amount = document.createElement('strong');
      amount.textContent = `≈ ${formatTry(value)}`;
      const detail = document.createElement('div');
      detail.className = 'detail';
      detail.textContent = `1 ${symbolFor(price.currency)} = ${formatTry(currentRates.perTry[price.currency])} · ECB ${dateFor(currentRates.date)}${currentRates.stale ? ' · eski kur' : ''}`;
      tip.append(amount, detail);
      shadow.append(style, tip);
      document.documentElement.append(host);
      const tipRect = host.getBoundingClientRect();
      host.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - tipRect.width))}px`;
      host.style.top = `${Math.max(0, rect.bottom + 6 + tipRect.height <= window.innerHeight ? rect.bottom + 6 : rect.top - tipRect.height - 6)}px`;
      selectionShown = selection;
    });
  }
  document.addEventListener('pointermove', event => {
    if (!enabled || selectionShown) return;
    const x = event.clientX, y = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    if (shownRect && (x < shownRect.left - 24 || x > shownRect.right + 24 || y < shownRect.top - 24 || y > shownRect.bottom + 24)) hide();
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
      const position = document.caretPositionFromPoint?.(x, y);
      const fallback = position ? null : doc.caretRangeFromPoint?.(x, y);
      const node = position?.offsetNode ?? fallback?.startContainer;
      const offset = position?.offset ?? fallback?.startOffset;
      if (target?.closest(ignored) || node?.parentElement?.closest(ignored)) return;
      if (node && node.nodeType === Node.TEXT_NODE && offset !== undefined) {
        const text = node.textContent ?? '';
        const start = Math.max(0, offset - 24);
        const match = findPriceAt(text.slice(start, offset + 24), offset - start);
        if (match) {
          const range = document.createRange();
          range.setStart(node, start + match.start);
          range.setEnd(node, start + match.end);
          show(match, range.getBoundingClientRect(), false);
          return;
        }
      }
      const price = target && priceCandidate(target.textContent ?? '', target.children.length);
      if (price && target) show(price, target.getBoundingClientRect(), false);
    }, 150);
  }, { passive: true });
  function showSelection(): void {
    if (!enabled) return;
    hide();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const parent = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (parent?.closest(ignored)) return;
    const text = selection.toString().trim();
    if (!text || text.length > 40) return;
    const price = parsePrice(text) ?? findPriceAt(text, Math.floor(text.length / 2));
    if (price) { selectionShown = true; show(price, range.getBoundingClientRect(), true); }
  }
  document.addEventListener('mousedown', hide);
  document.addEventListener('mouseup', showSelection);
  document.addEventListener('keyup', event => { if (event.shiftKey) showSelection(); });
  document.addEventListener('scroll', hide, { passive: true, capture: true });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[CURRENCY_SETTINGS_KEY])) { enabled = false; hide(); void updateEnabled(); }
  });
  void updateEnabled();
}

async function init(): Promise<void> {
  const settings = await loadCurrencySettings();
  initHover();
  document.querySelectorAll('.game_purchase_action > [data-lifetools-currency]').forEach(element => element.remove());
  if (!settings.steamInline || !steamPage || !await isModuleEnabled('currency')) return;
  const rates = await chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Rates | null;
  if (!rates) return;
  const storageKey = 'currency.steamShowOriginal';
  const stored = await chrome.storage.local.get(storageKey);
  let showOriginal = stored[storageKey] === true;
  const written = new WeakSet<Element>();
  const converted = new WeakMap<Element, string>();
  const controls = new WeakSet<Element>();
  function toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    showOriginal = !showOriginal;
    void chrome.storage.local.set({ [storageKey]: showOriginal });
    scan();
  }
  function scan(): void {
    for (const block of document.querySelectorAll('.game_area_purchase_game, .game_area_purchase_game_dropdown_selection')) {
      for (const element of block.querySelectorAll<HTMLElement>('.discount_final_price, .discount_original_price, .game_purchase_price')) {
        const current = element.textContent ?? '';
        let original = element.dataset.lifetoolsOriginal;
        if (original === undefined || (current !== original && current !== converted.get(element))) {
          original = current;
          element.dataset.lifetoolsOriginal = original;
        }
        const isOriginalPrice = element.matches('.discount_original_price');
        const price = isOriginalPrice ? parsePrice(original.trim()) : steamFinalAmount(
          element.closest('[data-price-final]')?.getAttribute('data-price-final') ?? block.querySelector('[data-price-final]')?.getAttribute('data-price-final') ?? null,
          original
        );
        const value = price && convert(price, rates!.perTry);
        if (!price || value === null) continue;
        const tl = formatTry(value);
        converted.set(element, tl);
        element.dataset.lifetoolsCurrency = 'try';
        element.title = `Orijinal: ${original.trim()} · 1 ${symbolFor(price.currency)} = ${formatTry(rates!.perTry[price.currency])} · ECB ${dateFor(rates!.date)} · tıkla: ${showOriginal ? 'TL' : symbolFor(price.currency)} göster`;
        const display = showOriginal ? original : tl;
        if (current !== display) {
          written.add(element);
          element.textContent = display;
        }
        const control = element.closest<HTMLElement>('.discount_prices') ?? element;
        control.style.cursor = 'pointer';
        control.setAttribute('role', 'button');
        control.setAttribute('tabindex', '0');
        control.setAttribute('aria-label', showOriginal ? 'Fiyatı TL olarak göster' : 'Fiyatı dolar olarak göster');
        if (!controls.has(control)) {
          controls.add(control);
          control.addEventListener('click', toggle);
          control.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') toggle(event);
          });
        }
      }
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(records => {
    if (records.every(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const price = target?.closest('[data-lifetools-currency]');
      return !!target?.closest('[data-lifetools-currency-tip]') ||
        (!!price && written.has(price) && price.textContent === (showOriginal ? (price as HTMLElement).dataset.lifetoolsOriginal : converted.get(price))) ||
        (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].length > 0 && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.hasAttribute('data-lifetools-currency-tip')));
    })) return;
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; scan(); }); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[storageKey]) {
      showOriginal = changes[storageKey].newValue === true;
      scan();
    }
  });
  scan();
}
void init();
