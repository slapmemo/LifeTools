import { convert, formatTry, parsePrice, type Rates } from './rates';
import { loadCurrencySettings } from './settings';

const selectors = '.game_purchase_price, .discount_final_price, .discount_original_price, .game_area_dlc_price, .game_area_purchase_game .price';
export function initHover(): void { /* Ayrı görevde uygulanacak. */ }
async function init(): Promise<void> {
  const settings = await loadCurrencySettings();
  if (settings.hoverAllSites) initHover();
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
