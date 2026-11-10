import { convert, formatTry, parsePrice, type Rates } from './rates';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PAGE_THEME } from '../../core/page-theme';
import { CURRENCY_SETTINGS_KEY, loadCurrencySettings } from './settings';
import { priceCandidate } from './hover';

const selectors = '.game_purchase_price, .discount_final_price, .discount_original_price, .game_area_dlc_price, .game_area_purchase_game .price';
export function initHover(): void {
  let enabled = false;
  let revision = 0;
  let rates: Rates | null = null;
  let pendingRates: Promise<Rates | null> | null = null;
  let active: Element | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let host: HTMLElement | null = null;
  const cache = new WeakMap<Element, ReturnType<typeof parsePrice>>();
  const ignored = 'input, textarea, [contenteditable]:not([contenteditable="false"]), [data-lifetools-currency], [data-lifetools-currency-tip]';
  function hide(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    active = null;
    host?.remove();
    host = null;
  }
  async function updateEnabled(): Promise<void> {
    const current = ++revision;
    const [settings, moduleEnabled] = await Promise.all([loadCurrencySettings(), isModuleEnabled('currency')]);
    if (current !== revision) return;
    enabled = settings.hoverAllSites && moduleEnabled;
    if (!enabled) hide();
  }
  function getRates(): Promise<Rates | null> {
    if (rates && Date.now() - rates.fetchedAt < 6 * 60 * 60 * 1000) return Promise.resolve(rates);
    if (!pendingRates) {
      pendingRates = (chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Promise<Rates | null>)
        .then(result => { rates = result; return result; }).catch(() => null)
        .finally(() => { pendingRates = null; });
    }
    return pendingRates;
  }
  function candidate(element: Element): ReturnType<typeof parsePrice> {
    if (cache.has(element)) return cache.get(element) ?? null;
    const price = priceCandidate(element.textContent ?? '', element.querySelectorAll('*').length);
    cache.set(element, price);
    return price;
  }
  document.addEventListener('pointerover', event => {
    if (!enabled || !(event.target instanceof Element) || event.target.closest(ignored)) return;
    let element: Element | null = event.target;
    let price = candidate(element);
    if (!price) {
      element = element.parentElement;
      if (!element || element.closest(ignored)) { hide(); return; }
      price = candidate(element);
    }
    if (!price) { hide(); return; }
    if (active === element) return;
    hide();
    active = element;
    const selected = element;
    const selectedPrice = price;
    timer = setTimeout(() => {
      timer = undefined;
      void getRates().then(currentRates => {
        if (!enabled || active !== selected || !selected.isConnected || !currentRates) return;
        const value = convert(selectedPrice, currentRates.perTry);
        if (value === null) return;
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
        const symbol = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', PLN: 'zł' } as Record<string, string>)[selectedPrice.currency] ?? selectedPrice.currency;
        const date = currentRates.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
        detail.textContent = `1 ${symbol} = ${formatTry(currentRates.perTry[selectedPrice.currency])} · ECB ${date}${currentRates.stale ? ' · eski kur' : ''}`;
        tip.append(amount, detail);
        shadow.append(style, tip);
        document.documentElement.append(host);
        const rect = selected.getBoundingClientRect();
        const tipRect = host.getBoundingClientRect();
        host.style.left = `${Math.max(0, Math.min(rect.left, window.innerWidth - tipRect.width))}px`;
        host.style.top = `${Math.max(0, rect.bottom + 6 + tipRect.height <= window.innerHeight ? rect.bottom + 6 : rect.top - tipRect.height - 6)}px`;
      });
    }, 150);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (active && event.target instanceof Node && active.contains(event.target) && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget))) hide();
  }, { passive: true });
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
  if (!settings.steamInline || location.hostname !== 'store.steampowered.com' || !location.pathname.startsWith('/app/')) return;
  const rates = await chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Rates | null;
  if (!rates) return;
  const processed = new WeakMap<Element, string>();
  function scan(): void {
    for (const node of document.querySelectorAll(selectors)) {
      const text = node.textContent?.trim() ?? '';
      if (processed.get(node) === text) continue;
      const old = node.nextElementSibling;
      if (old?.hasAttribute('data-lifetools-currency')) old.remove();
      processed.set(node, text);
      const price = parsePrice(text);
      if (!price) continue;
      const value = convert(price, rates!.perTry);
      if (value === null) continue;
      const span = document.createElement('span');
      span.dataset.lifetoolsCurrency = '';
      span.textContent = ` (≈ ${formatTry(value)})`;
      span.style.fontSize = '0.85em'; span.style.opacity = '0.75'; span.style.color = 'inherit';
      const symbol = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', PLN: 'zł' } as Record<string, string>)[price.currency] ?? price.currency;
      span.title = `1 ${symbol} = ${formatTry(rates!.perTry[price.currency])} · ECB ${rates!.date}`;
      node.after(span);
    }
  }
  let scheduled = false;
  const observer = new MutationObserver(records => {
    if (records.every(record => record.target instanceof Element && record.target.closest('[data-lifetools-currency]') || record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node instanceof Element && node.hasAttribute('data-lifetools-currency')))) return;
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; scan(); }); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scan();
}
void init();
