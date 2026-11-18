export const CURRENCY_SETTINGS_KEY = 'currency.settings';
export const STEAM_ORIGIN = 'https://store.steampowered.com/*';
// Bilinçli karar: yalnız HTTPS. Fiyat gösteren siteler neredeyse hep HTTPS; http://*/* izni istemek
// izin penceresini genişletir ve şifresiz sayfalara betik sokar.
export const ALL_SITES_ORIGIN = 'https://*/*';
export interface CurrencySettings { steamInline: boolean; hoverAllSites: boolean }
export async function loadCurrencySettings(): Promise<CurrencySettings> {
  const data = await chrome.storage.local.get({ [CURRENCY_SETTINGS_KEY]: {} });
  const value = data[CURRENCY_SETTINGS_KEY] as Partial<CurrencySettings> | null;
  return { steamInline: value?.steamInline !== false, hoverAllSites: value?.hoverAllSites === true };
}
