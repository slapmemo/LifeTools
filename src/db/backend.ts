export type DbBackend = 'browser' | 'desktop';

/** chrome.storage.local anahtarı: 'browser' (varsayılan) veya 'desktop'. */
export const DB_BACKEND_KEY = 'db_backend';

export async function getBackend(): Promise<DbBackend> {
  const data = await chrome.storage.local.get({ [DB_BACKEND_KEY]: 'browser' });
  return data[DB_BACKEND_KEY] === 'desktop' ? 'desktop' : 'browser';
}

export async function setBackend(backend: DbBackend): Promise<void> {
  await chrome.storage.local.set({ [DB_BACKEND_KEY]: backend });
}
