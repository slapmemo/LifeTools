/** Sekme Yöneticisi sayfası mı: sorgu (`?`) ve parça (`#`) farkı yok sayılır. */
export function isManagerTabUrl(url: string | undefined, managerUrl: string): boolean {
  return !!url && url.split(/[?#]/)[0] === managerUrl;
}

type TabLike = { id?: number; url?: string; pendingUrl?: string; index: number };

/** Penceredeki Yönetici sekmeleri soldan sağa; ilki tutulur, gerisi fazlalıktır. */
export function managerTabs<T extends TabLike>(tabs: readonly T[], managerUrl: string): T[] {
  return tabs.filter(t => isManagerTabUrl(t.url, managerUrl) || isManagerTabUrl(t.pendingUrl, managerUrl)).sort((a, b) => a.index - b.index);
}
