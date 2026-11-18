import { STEAM_ORIGIN } from '../modules/currency/settings';
import { YOUTUBE_ORIGINS } from '../modules/video-downloader/logic';
import { PAGE_ORIGINS } from '../modules/watchlist/page-logic';
/** İsteğe bağlı site izni + kayıtlı içerik betiği mekanizması (Metin Kısayolları ve Site Araç Çubuğu ortak kullanır). */

/** Kullanıcı girdisinden ("example.com" veya tam adres) `https://host/*` kalıbı üretir; geçersizse null. */
export function originFromInput(raw: string): string | null {
  try {
    const text = raw.trim();
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch { return null; }
}

/** Sayfa adresinden `protocol//host/*` kalıbı; geçersizse null. */
export function originOfUrl(raw: string | undefined): string | null {
  try { const url = new URL(raw ?? ''); return ['http:', 'https:'].includes(url.protocol) ? `${url.protocol}//${url.hostname}/*` : null; }
  catch { return null; }
}

/** Kayıtlı betiği sıfırlar; izni olan kalıplar varsa yeniden kaydeder. `origins` boşsa yalnızca kaldırır. */
export interface SiteRegistration { matches?: readonly string[]; js?: readonly string[]; allFrames?: boolean; world?: string }

/** Mevcut kayıt istenenle aynı mı (eşleşme sırası önemsiz; world varsayılanı ISOLATED). */
export function sameRegistration(existing: SiteRegistration, desired: SiteRegistration): boolean {
  const list = (v: readonly string[] | undefined): string => JSON.stringify([...(v ?? [])].sort());
  const js = (v: readonly string[] | undefined): string => JSON.stringify([...(v ?? [])]);
  return list(existing.matches) === list(desired.matches)
    && js(existing.js) === js(desired.js)
    && (existing.allFrames ?? false) === (desired.allFrames ?? false)
    && (existing.world ?? 'ISOLATED') === (desired.world ?? 'ISOLATED');
}

export async function replaceSiteScript(id: string, origins: readonly string[], file: string, allFrames: boolean, world?: 'ISOLATED' | 'MAIN'): Promise<void> {
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  const matches: string[] = [];
  for (const origin of origins) if (await chrome.permissions.contains({ origins: [origin] })) matches.push(origin);
  if (!matches.length) {
    if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [id] });
    return;
  }
  const desired = { matches: [...matches].sort(), js: [file], allFrames, world: world ?? 'ISOLATED' };
  if (registered.length) {
    if (sameRegistration(registered[0], desired)) return;
    // world verilmezse açıkça ISOLATED gönder; yoksa önceki kayıttaki MAIN değeri kalır.
    await chrome.scripting.updateContentScripts([{ id, matches, js: [file], persistAcrossSessions: true, allFrames, world: world ?? 'ISOLATED' }]);
    return;
  }
  await chrome.scripting.registerContentScripts([{ id, matches, js: [file], persistAcrossSessions: true, allFrames, ...(world ? { world } : {}) }]);
}

/** Aynı `https://site/*` iznini kullanan modüllerin depolama anahtarları (smart-replies `SITES_KEY`, site-toolbar `TOOLBAR_SITES_KEY`). */
export const SHARED_ORIGIN_KEYS = { smartReplies: 'smartReplySites', siteToolbar: 'siteToolbarSites' } as const;

/** İki modülün kayıtlarından, hâlâ kullanılan kökenleri toplar. */
export function originsInUse(data: Record<string, unknown>): Set<string> {
  const used = new Set<string>();
  const smart = data[SHARED_ORIGIN_KEYS.smartReplies];
  if (Array.isArray(smart)) for (const o of smart) if (typeof o === 'string') used.add(o);
  const toolbar = data[SHARED_ORIGIN_KEYS.siteToolbar];
  if (Array.isArray(toolbar)) for (const row of toolbar) if (row && typeof row === 'object' && typeof (row as { origin?: unknown }).origin === 'string') used.add((row as { origin: string }).origin);
  return used;
}

/**
 * Diğer modüllerin sabit site izinleri (YouTube/IMDb izleme düğmesi, YouTube indirme düğmesi, Steam döviz).
 * Chrome izinleri eklenti genelinde ortak; bunlar Metin Kısayolları ya da Araç Çubuğu'ndan site kaldırılınca geri alınmaz.
 */
export const FIXED_MODULE_ORIGINS: readonly string[] = [...PAGE_ORIGINS, ...YOUTUBE_ORIGINS, STEAM_ORIGIN];

/** Site izni yalnız hiçbir modül o kökeni kullanmıyorsa geri alınır. Kayıt listesi güncellendikten sonra çağır. */
export async function releaseOrigin(origin: string): Promise<void> {
  if (FIXED_MODULE_ORIGINS.includes(origin)) return;
  const data = await chrome.storage.local.get([SHARED_ORIGIN_KEYS.smartReplies, SHARED_ORIGIN_KEYS.siteToolbar]);
  if (originsInUse(data).has(origin)) return;
  await chrome.permissions.remove({ origins: [origin] });
}
