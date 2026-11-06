import { isBlockedUrl } from './shared/rules.mjs';
import { loadSettings } from './shared/settings.mjs';

// Her navigasyonda yalnızca X/Twitter adreslerini değerlendiriyoruz.
const URL_FILTERS = [
  { hostEquals: 'x.com' },
  { hostEquals: 'www.x.com' },
  { hostEquals: 'twitter.com' },
  { hostEquals: 'www.twitter.com' }
];

const closingTabIds = new Set();

async function inspectTab(tabId, url) {
  if (tabId < 0 || !url || closingTabIds.has(tabId)) return;

  try {
    const settings = await loadSettings();
    if (!settings.enabled || !isBlockedUrl(url, settings.blockedHandles)) return;

    // Asenkron okuma sırasında sekme başka bir adrese geçmiş olabilir.
    // onBeforeNavigate aşamasında eski URL görünebildiğinden hem URL hem pendingUrl kontrol edilir.
    const tab = await chrome.tabs.get(tabId);
    const candidates = [tab.url, tab.pendingUrl].filter(Boolean);
    if (!candidates.some(value => isBlockedUrl(value, settings.blockedHandles))) return;

    closingTabIds.add(tabId);
    await chrome.tabs.remove(tabId);
  } catch (err) {
    // Kapatılmış/geçersiz bir sekmede işlem yapmaya gerek yok.
    console.debug('[X Koruma] Sekme işlenemedi:', err);
  } finally {
    closingTabIds.delete(tabId);
  }
}

function handleNavigation(details) {
  if (details.frameId !== 0) return; // Sadece üst sekme; gömülü frame'ler değil.
  void inspectTab(details.tabId, details.url);
}

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
async function inspectOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: [
      '*://x.com/*', '*://www.x.com/*',
      '*://twitter.com/*', '*://www.twitter.com/*'
    ] });
    await Promise.all(tabs.map(tab => inspectTab(tab.id, tab.pendingUrl || tab.url)));
  } catch (err) {
    console.debug('[X Koruma] Açık sekmeler taranamadı:', err);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.enabled || changes.blockedHandles)) {
    void inspectOpenTabs();
  }
});

// Tarayıcı/eklenti yeniden açıldığında mevcut engelli sekmeleri yakala.
chrome.runtime.onStartup.addListener(() => { void inspectOpenTabs(); });
chrome.runtime.onInstalled.addListener(() => { void inspectOpenTabs(); });
