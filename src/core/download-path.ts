export function sanitizeDownloadFolder(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\\/g, '/').replace(/\.\./g, '').replace(/[<>:"|?*\x00-\x1f]/g, '')
    .split('/').map(part => part.trim().replace(/^\.+|\.+$/g, '').trim()).filter(Boolean)
    .join('/').slice(0, 100).replace(/[/. ]+$/g, '');
}

export function downloadPath(folder: unknown, filename: string): string {
  const clean = sanitizeDownloadFolder(folder);
  return clean ? `${clean}/${filename}` : filename;
}
