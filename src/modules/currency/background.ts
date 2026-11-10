import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { getRates } from './rates';
import { ALL_SITES_ORIGIN, CURRENCY_SETTINGS_KEY, loadCurrencySettings, STEAM_ORIGIN } from './settings';
export const CURRENCY_ID = 'currency';
let queue: Promise<unknown> = Promise.resolve();
function refresh(): void {
  queue = queue.then(async () => {
    const settings = await loadCurrencySettings();
    const enabled = await isModuleEnabled(CURRENCY_ID);
    const origins = enabled ? [settings.steamInline ? STEAM_ORIGIN : '', settings.hoverAllSites ? ALL_SITES_ORIGIN : ''].filter(Boolean) : [];
    await replaceSiteScript('currency-content', origins, 'currency-content.js', false);
  }).catch(error => { console.debug('[Döviz Çevirici]', error); });
}
export function initCurrencyBackground(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
    if (msg?.channel !== 'currency' || msg.type !== 'rates') return false;
    void isModuleEnabled(CURRENCY_ID).then(enabled => enabled ? getRates() : null).then(respond).catch(() => respond(null));
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[CURRENCY_SETTINGS_KEY])) refresh(); });
  chrome.permissions.onAdded.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
}
