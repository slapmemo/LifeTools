import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { PAGE_THEME } from '../../core/page-theme';
import { copyOffscreen } from '../../db/host';
import { cleanUrl } from './clean';
import { AUTO_CLEAN_KEY, AUTO_CLEAN_ORIGINS, updateCleaningRules } from './rules';
import { isShortLink, SHORTENER_ORIGINS, SHORT_LINK_KEY, SHORT_LINK_PERMISSION_ORIGINS } from './shorteners';

export const LINK_CLEANER_ID = 'link-cleaner';
const LINK_MENU = 'link-cleaner:link';
const PAGE_MENU = 'link-cleaner:page';
const SHORT_MENU = 'link-cleaner:expand';

export async function expandShortLink(url: string): Promise<string> {
  if (!isShortLink(url)) throw new Error('Geçersiz kısa link');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const options: RequestInit = { redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: controller.signal };
    let response: Response;
    try {
      response = await fetch(url, { ...options, method: 'HEAD' });
      if (!response.ok) throw new Error('HEAD başarısız');
    } catch {
      if (controller.signal.aborted) throw new Error('Zaman aşımı');
      response = await fetch(url, { ...options, method: 'GET' });
      controller.abort();
      if (!response.ok) throw new Error('GET başarısız');
    }
    const cleaned = cleanUrl(response.url);
    if (!cleaned) throw new Error('Geçersiz adres');
    return cleaned.url;
  } finally { clearTimeout(timeout); }
}

async function showExpanded(rawUrl: string, tabId?: number): Promise<void> {
  if (!(await isModuleEnabled(LINK_CLEANER_ID))) return;
  const settings = await chrome.storage.local.get({ [SHORT_LINK_KEY]: false });
  if (!settings[SHORT_LINK_KEY] || !(await chrome.permissions.contains({ origins: SHORT_LINK_PERMISSION_ORIGINS }))) return;
  try {
    const url = await expandShortLink(rawUrl);
    if (!(await copyOffscreen(url))) throw new Error('Kopyalanamadı');
    if (tabId === undefined) throw new Error('Sekme yok');
    await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [{ ok: true, title: `Gerçek adres: ${new URL(url).host}`, detail: `${url}\nKopyalandı ✓` }, PAGE_THEME] });
  } catch {
    try {
      if (tabId === undefined) throw new Error('Sekme yok');
      await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [{ ok: false, title: 'Adres çözülemedi' }, PAGE_THEME] });
    } catch { flashBadge('!'); }
  }
}

async function copyCleaned(rawUrl: string, tabId?: number): Promise<void> {
  if (!(await isModuleEnabled(LINK_CLEANER_ID))) return;
  const result = cleanUrl(rawUrl);
  if (!result) {
    flashBadge('!');
    return;
  }
  try {
    if (!(await copyOffscreen(result.url))) { flashBadge('!'); return; }
    try {
      if (tabId === undefined) throw new Error('Sekme yok');
      await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [{ ok: true, title: result.removed.length ? 'Temiz link kopyalandı ✓' : 'Kaldırılacak takip parametresi yok — link kopyalandı' }, PAGE_THEME] });
    } catch { flashBadge('✓'); }
  } catch {
    flashBadge('!');
  }
}

export function linkCleanerMenuContributions(shortEnabled = false): ContextMenuContribution[] {
  return [
    {
      id: LINK_MENU,
      title: 'Temiz linki kopyala',
      contexts: ['link'],
      moduleId: LINK_CLEANER_ID,
      enabled: flags => resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => {
        await copyCleaned(info.linkUrl || '', tab?.id);
      }
    },
    {
      id: SHORT_MENU,
      title: 'Gerçek adresi göster',
      contexts: ['link'],
      targetUrlPatterns: SHORTENER_ORIGINS,
      moduleId: LINK_CLEANER_ID,
      enabled: flags => shortEnabled && resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => { await showExpanded(info.linkUrl || '', tab?.id); }
    },
    {
      id: PAGE_MENU,
      title: 'Bu sayfanın temiz linki',
      contexts: ['page'],
      moduleId: LINK_CLEANER_ID,
      enabled: flags => resolveEnabled(flags, LINK_CLEANER_ID),
      onClick: async (info, tab) => {
        await copyCleaned(info.pageUrl || tab?.url || '', tab?.id);
      }
    }
  ];
}

export function initLinkCleanerBackground(): void {
  let queue = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      const data = await chrome.storage.local.get({ [AUTO_CLEAN_KEY]: false, [SHORT_LINK_KEY]: false });
      const enabled = data[AUTO_CLEAN_KEY] === true && await isModuleEnabled(LINK_CLEANER_ID) && await chrome.permissions.contains({ origins: AUTO_CLEAN_ORIGINS });
      await updateCleaningRules(enabled);
      const shortEnabled = data[SHORT_LINK_KEY] === true && await chrome.permissions.contains({ origins: SHORT_LINK_PERMISSION_ORIGINS });
      setContextMenuContributions(LINK_CLEANER_ID, linkCleanerMenuContributions(shortEnabled));
    }).catch(err => { console.debug('[Link Temizleyici]', err); });
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[AUTO_CLEAN_KEY] || changes[SHORT_LINK_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
  chrome.permissions.onAdded.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
  refresh();
  setContextMenuContributions(LINK_CLEANER_ID, linkCleanerMenuContributions());
}
