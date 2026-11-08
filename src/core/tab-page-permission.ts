export async function canInjectTabPage(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return await chrome.permissions.contains({ origins: [`${parsed.origin}/*`] });
  } catch { return false; }
}
