export function sanitizeDownloadFolder(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\\/g, '/').replace(/\.\./g, '').replace(/[<>:"|?*\x00-\x1f]/g, '')
    .split('/').map(part => part.trim().replace(/^\.+|\.+$/g, '').trim()).filter(Boolean)
    .join('/').slice(0, 100).replace(/[/. ]+$/g, '');
}

export const SUBFOLDER_KEY = 'downloads.subfolder';
const LEGACY_X_SETTINGS_KEY = 'xVideoSettings';

/** Ortak anahtar tanımlıysa onu, değilse eski X Video klasörünü kullanır. */
export function resolveSubfolder(shared: unknown, legacy: unknown): string {
  return sanitizeDownloadFolder(typeof shared === 'string' ? shared : legacy);
}

/** Ortak indirme alt klasörünü okur; yoksa eski X Video değerini bir kez kopyalar. */
export async function loadSubfolder(): Promise<string> {
  const data = await chrome.storage.local.get([SUBFOLDER_KEY, LEGACY_X_SETTINGS_KEY]);
  const folder = resolveSubfolder(data[SUBFOLDER_KEY], data[LEGACY_X_SETTINGS_KEY]?.downloadFolder);
  if (typeof data[SUBFOLDER_KEY] !== 'string') {
    try { await chrome.storage.local.set({ [SUBFOLDER_KEY]: folder }); } catch { /* kopyalama sonraki okumada tekrar denenir */ }
  }
  return folder;
}

export function downloadPath(folder: unknown, filename: string): string {
  const clean = sanitizeDownloadFolder(folder);
  return clean ? `${clean}/${filename}` : filename;
}
