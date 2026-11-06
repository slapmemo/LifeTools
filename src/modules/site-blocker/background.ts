import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { isBlockedUrl } from './rules';
import { loadSettings } from './settings';

export const SITE_BLOCKER_ID = 'site-blocker';

// Her navigasyonda yalnızca X/Twitter adreslerini değerlendiriyoruz.
const URL_FILTERS: chrome.events.UrlFilter[] = [
  { hostEquals: 'x.com' },
  { hostEquals: 'www.x.com' },
  { hostEquals: 'twitter.com' },
  { hostEquals: 'www.twitter.com' }
];

const closingTabIds = new Set<number>();

async function inspectTab(tabId: number, url: string | undefined): Promise<void> {
  if (tabId < 0 || !url || closingTabIds.has(tabId)) return;

  try {
    // Modül kapalıysa dinleyiciler hiçbir şey yapmaz.
    if (!(await isModuleEnabled(SITE_BLOCKER_ID))) return;
    const settings = await loadSettings();
    if (!settings.enabled || !isBlockedUrl(url, settings.blockedHandles)) return;

    // Asenkron okuma sırasında sekme başka bir adrese geçmiş olabilir.
    // onBeforeNavigate aşamasında eski URL görünebildiğinden hem URL hem pendingUrl kontrol edilir.
    const tab = await chrome.tabs.get(tabId);
    const candidates = [tab.url, tab.pendingUrl].filter((v): v is string => Boolean(v));
    if (!candidates.some(value => isBlockedUrl(value, settings.blockedHandles))) return;

    closingTabIds.add(tabId);
    await chrome.tabs.remove(tabId);
  } catch (err) {
    // Kapatılmış/geçersiz bir sekmede işlem yapmaya gerek yok.
    console.debug('[Site Engelleyici] Sekme işlenemedi:', err);
  } finally {
    closingTabIds.delete(tabId);
  }
}

function handleNavigation(details: { frameId: number; tabId: number; url: string }): void {
  if (details.frameId !== 0) return; // Sadece üst sekme; gömülü frame'ler değil.
  void inspectTab(details.tabId, details.url);
}

async function inspectOpenTabs(): Promise<void> {
  try {
    if (!(await isModuleEnabled(SITE_BLOCKER_ID))) return;
    const tabs = await chrome.tabs.query({
      url: ['*://x.com/*', '*://www.x.com/*', '*://twitter.com/*', '*://www.twitter.com/*']
    });
    await Promise.all(
      tabs.filter(tab => tab.id !== undefined).map(tab => inspectTab(tab.id as number, tab.pendingUrl || tab.url))
    );
  } catch (err) {
    console.debug('[Site Engelleyici] Açık sekmeler taranamadı:', err);
  }
}

/** Dinleyicileri kaydeder (service worker üst düzeyinde çağrılmalı). */
export function initSiteBlockerBackground(): void {
  // Dış bağlantıdan veya adres çubuğundan giriş.
  chrome.webNavigation.onBeforeNavigate.addListener(handleNavigation, { url: URL_FILTERS });
  chrome.webNavigation.onCommitted.addListener(handleNavigation, { url: URL_FILTERS });

  // X'in pushState/replaceState kullanan sayfa içi geçişleri.
  chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation, { url: URL_FILTERS });

  // Adres başka şekilde güncellenirse yedek kontrol.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) void inspectTab(tabId, changeInfo.url);
  });

  // Engelleme etkinleştirildiğinde veya liste değiştiğinde açık sekmeleri de kontrol et.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.enabled || changes.blockedHandles || changes[MODULE_FLAGS_KEY])) {
      void inspectOpenTabs();
    }
  });

  // Tarayıcı/eklenti yeniden açıldığında mevcut engelli sekmeleri yakala.
  chrome.runtime.onStartup.addListener(() => { void inspectOpenTabs(); });
  chrome.runtime.onInstalled.addListener(() => { void inspectOpenTabs(); });
}
