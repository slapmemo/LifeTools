import { modules } from '../modules';
import { MODULE_FLAGS_KEY } from './module-state';

export const RECOMMENDED_MODULES: readonly string[] = ['slapmemo', 'link-cleaner', 'quick-tasks', 'command-center', 'tab-switcher', 'tab-manager', 'life-browser', 'video-downloader', 'instagram', 'x-video', 'pip', 'volume-booster', 'shortcuts', 'tab-notes', 'watchlist'];
export const ONBOARDING_DONE_KEY = 'onboardingDone';

export function recommendedFlags(ids: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(ids.map(id => [id, RECOMMENDED_MODULES.includes(id)]));
}

export function initOnboarding(): void {
  chrome.runtime.onInstalled.addListener(details => {
    if (details.reason !== 'install') return;
    void (async () => {
      const data = await chrome.storage.local.get(MODULE_FLAGS_KEY);
      const flags: unknown = data[MODULE_FLAGS_KEY];
      if (flags == null || (typeof flags === 'object' && Object.keys(flags).length === 0)) {
        await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: recommendedFlags(modules.map(m => m.id)) });
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    })();
  });
}
