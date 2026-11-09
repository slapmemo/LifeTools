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

export function desktopVersionWarning(desktop: string, extension: string): string {
  return compareVersions(desktop, extension) === -1
    ? `Masaüstü uygulaması eski (v${desktop}). Yeni özellikler için güncelle.`
    : '';
}

export function videoNativeError(message: string): string {
  return message.includes('Bilinmeyen işlem')
    ? 'Masaüstü uygulaması bu özelliği desteklemiyor, lütfen güncelle.'
    : message;
}
