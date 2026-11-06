/** Sabit sekme kimliği -> bilgisi (chrome.storage.session; tarayıcı yeniden başlayınca sıfırlanır). */
export const PINNED_MAP_KEY = 'pinnedGuardTabs';
/** Son kapanan sabit sekmeler listesi (chrome.storage.local, en fazla 10). */
export const CLOSED_KEY = 'pinnedGuardClosed';
export const MAX_CLOSED = 10;
export const NOTIFICATION_PREFIX = 'pinned-guard:';

export interface PinnedInfo { url: string; title: string; windowId: number }
export interface ClosedPinned extends PinnedInfo { key: string; closedAt: number }

/** Yeni kapananı başa ekler, aynı anahtarı tekrarlamaz, listeyi `max` öğede keser. */
export function pushClosed(list: readonly ClosedPinned[], entry: ClosedPinned, max = MAX_CLOSED): ClosedPinned[] {
  return [entry, ...list.filter(item => item.key !== entry.key)].slice(0, max);
}

/** Depodan gelen değeri güvenli biçimde listeye çevirir. */
export function readClosed(value: unknown): ClosedPinned[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ClosedPinned => typeof item === 'object' && item !== null
    && typeof item.key === 'string' && typeof item.url === 'string' && typeof item.title === 'string'
    && typeof item.windowId === 'number' && typeof item.closedAt === 'number');
}
