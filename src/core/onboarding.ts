import { modules } from '../modules';
import { MODULE_FLAGS_KEY } from './module-state';
import { whatsNewFrom } from './whats-new';

export const RECOMMENDED_MODULES: readonly string[] = ['currency', 'slapmemo', 'link-cleaner', 'tab-manager', 'video-downloader', 'instagram', 'x-video', 'pip', 'volume-booster', 'shortcuts', 'tab-notes', 'time-tracker'];
export const ONBOARDING_DONE_KEY = 'onboardingDone';
/** Özellik rehberinin (yenilikler) en son gösterildiği eklenti sürümü. */
export const SEEN_VERSION_KEY = 'whatsNewSeenVersion';

export function recommendedFlags(ids: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map(id => [id, RECOMMENDED_MODULES.includes(id)]));
}

async function mergeLegacyTabManagerFlag(): Promise<void> {
  const data = await chrome.storage.local.get(MODULE_FLAGS_KEY);
  const stored: unknown = data[MODULE_FLAGS_KEY];
  if (typeof stored !== 'object' || stored === null || !Object.prototype.hasOwnProperty.call(stored, 'life-browser')) return;
  const flags = { ...(stored as Record<string, unknown>) };
  flags['tab-manager'] = flags['tab-manager'] !== false || flags['life-browser'] !== false;
  delete flags['life-browser'];
  await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: flags });
}

/** Güncellemeden sonra: son görülen sürümden beri anlatılacak yenilik varsa rehberi "yenilikler" kipinde açar. */
export async function showWhatsNewIfNeeded(current: string): Promise<void> {
  const seen = (await chrome.storage.local.get({ [SEEN_VERSION_KEY]: null }))[SEEN_VERSION_KEY];
  const from = whatsNewFrom(typeof seen === 'string' ? seen : null, current);
  // Önce kaydet: hata ya da çift tetiklenmede aynı sürüm için iki kez açılmasın.
  await chrome.storage.local.set({ [SEEN_VERSION_KEY]: current });
  if (from) await chrome.tabs.create({ url: chrome.runtime.getURL(`welcome.html?from=${encodeURIComponent(from)}`) });
}

export function initOnboarding(): void {
  chrome.runtime.onInstalled.addListener(details => {
    const current = chrome.runtime.getManifest().version;
    if (details.reason === 'update') {
      void mergeLegacyTabManagerFlag().then(() => showWhatsNewIfNeeded(current)).catch(() => {});
      return;
    }
    if (details.reason !== 'install') return;
    void (async () => {
      const data = await chrome.storage.local.get(MODULE_FLAGS_KEY);
      const flags: unknown = data[MODULE_FLAGS_KEY];
      if (flags == null || (typeof flags === 'object' && Object.keys(flags).length === 0)) {
        await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: recommendedFlags(modules.map(m => m.id)) });
      }
      await chrome.storage.local.set({ [SEEN_VERSION_KEY]: current });
      await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html?setup=1') });
    })();
  });
}
