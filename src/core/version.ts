/** Compares major.minor.patch versions. Invalid versions cannot be compared. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] | null => {
    if (!/^\d+\.\d+\.\d+$/.test(value)) return null;
    const parts = value.split('.').map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
  };
  const left = parse(a), right = parse(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

/** True only when `a` is strictly newer than `b`; invalid versions are never newer. */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) === 1;
}

export type SelfUpdateAction = 'reload' | 'unmanaged' | 'none';

/**
 * Decides what the extension should do about the copy in the desktop's managed folder.
 * 'reload': managed folder is newer and we have not tried this version yet.
 * 'unmanaged': we already reloaded for that version but are still older, so we are not loaded from the managed folder.
 */
export function selfUpdateAction(current: string, managed: string | null | undefined, lastReloadFor: string | null | undefined): SelfUpdateAction {
  if (!managed || !isNewerVersion(managed, current)) return 'none';
  return lastReloadFor === managed ? 'unmanaged' : 'reload';
}

export function desktopVersionWarning(desktop: string, extension: string): string {
  return compareVersions(desktop, extension) === -1
    ? `Masaüstü uygulaması eski (v${desktop}). Yeni özellikler için güncelle.`
    : '';
}

export function videoNativeError(message: string): string {
  return message.includes('Bilinmeyen işlem') || message.includes('Geçersiz indirme modu')
    ? 'Masaüstü uygulaması bu özelliği desteklemiyor, lütfen güncelle.'
    : message;
}
