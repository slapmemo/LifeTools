import { resolveEnabled } from '../../core/module-state';
import { showToast } from '../../panel/ui';
import { formatTry, type Rates } from './rates';
import { ALL_SITES_ORIGIN, CURRENCY_SETTINGS_KEY, loadCurrencySettings, STEAM_ORIGIN } from './settings';

const CURRENCY_ID = 'currency';

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}.${month}.${year}` : date;
}

export function initCurrencyPanel(): { render(flags: unknown): Promise<void> } {
  const root = document.querySelector<HTMLElement>('#currency-panel')!;
  const steam = root.querySelector<HTMLInputElement>('#currency-steam')!;
  const hover = root.querySelector<HTMLInputElement>('#currency-hover')!;
  const line = root.querySelector<HTMLElement>('#currency-rates')!;

  function bind(input: HTMLInputElement, origin: string, key: 'steamInline' | 'hoverAllSites'): void {
    input.addEventListener('change', () => {
      const enabled = input.checked;
      const permission = enabled ? chrome.permissions.request({ origins: [origin] }) : Promise.resolve(true);
      void permission.then(async granted => {
        if (!granted) { input.checked = false; showToast('Site izni verilmedi.', 'error'); return; }
        const settings = await loadCurrencySettings();
        await chrome.storage.local.set({ [CURRENCY_SETTINGS_KEY]: { ...settings, [key]: enabled } });
      }).catch(() => { input.checked = !enabled; });
    });
  }
  bind(steam, STEAM_ORIGIN, 'steamInline');
  bind(hover, ALL_SITES_ORIGIN, 'hoverAllSites');

  async function render(flags: unknown): Promise<void> {
    const enabled = resolveEnabled(flags, CURRENCY_ID);
    root.hidden = !enabled;
    if (!enabled) return;
    const settings = await loadCurrencySettings();
    steam.checked = settings.steamInline && await chrome.permissions.contains({ origins: [STEAM_ORIGIN] });
    hover.checked = settings.hoverAllSites && await chrome.permissions.contains({ origins: [ALL_SITES_ORIGIN] });
    try {
      const rates = await chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Rates | null;
      const usd = rates?.perTry.USD, eur = rates?.perTry.EUR;
      line.textContent = rates && usd && eur ? `Kur: 1 $ = ${formatTry(usd)} · 1 € = ${formatTry(eur)} · ECB ${formatDate(rates.date)}` : 'Kur alınamadı';
    } catch { line.textContent = 'Kur alınamadı'; }
  }
  return { render };
}
