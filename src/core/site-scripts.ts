/** İsteğe bağlı site izni + kayıtlı içerik betiği mekanizması (Akıllı Yanıtlar ve Site Araç Çubuğu ortak kullanır). */

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
    await chrome.scripting.updateContentScripts([{ id, matches, js: [file], persistAcrossSessions: true, allFrames, ...(world ? { world } : {}) }]);
    return;
  }
  await chrome.scripting.registerContentScripts([{ id, matches, js: [file], persistAcrossSessions: true, allFrames, ...(world ? { world } : {}) }]);
}
