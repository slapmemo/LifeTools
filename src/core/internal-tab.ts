/** Whether a URL belongs to this extension. */
export function isInternalTabUrl(url: string | undefined | null, extensionBase: string): boolean {
  return !!url && !!extensionBase && url.startsWith(extensionBase);
}

export function extensionBaseUrl(): string {
  return typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('') : '';
}
