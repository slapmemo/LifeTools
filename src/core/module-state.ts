export const MODULE_FLAGS_KEY = 'moduleEnabled';

/** Saf fonksiyon: kayıt yoksa modül varsayılan olarak açıktır; yalnızca açık `false` kapatır. */
export function resolveEnabled(flags: unknown, id: string): boolean {
  if (typeof flags !== 'object' || flags === null) return true;
  return (flags as Record<string, unknown>)[id] !== false;
}

export async function isModuleEnabled(id: string): Promise<boolean> {
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} });
  return resolveEnabled(data[MODULE_FLAGS_KEY], id);
}

export async function setModuleEnabled(id: string, enabled: boolean): Promise<void> {
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} });
  const current = data[MODULE_FLAGS_KEY];
  const flags: Record<string, boolean> =
    typeof current === 'object' && current !== null ? { ...(current as Record<string, boolean>) } : {};
  flags[id] = enabled;
  await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: flags });
}
