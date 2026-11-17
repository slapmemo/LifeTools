export const PIP_HOVER_ENABLED_KEY = 'pip_hover_enabled';
export const PIP_HOVER_ORIGINS = ['https://*/*', 'http://*/*'];

/** Düğmenin çıkacağı en küçük video boyutu. Eskiden 200×120'ydi; küçük pencere / akış içi videolarda hiç çıkmıyordu. */
export const MIN_VIDEO_WIDTH = 96;
export const MIN_VIDEO_HEIGHT = 54;
const BUTTON = 28;
const GAP = 8;

export interface Box { left: number; right: number; top: number; bottom: number }

export function bigEnough(width: number, height: number): boolean {
  return width >= MIN_VIDEO_WIDTH && height >= MIN_VIDEO_HEIGHT;
}

/**
 * İmlecin altındaki videoyu seçer. Çoğu sitede (YouTube, X, Twitch…) videonun üstünde saydam bir kontrol katmanı
 * olduğundan fare olayı hiçbir zaman <video> öğesine gelmez; bu yüzden konuma bakılır. Birden çok video imleci
 * içeriyorsa (arka plan + oynatıcı gibi) en küçük alanlı olan, yani en "içteki" seçilir.
 */
export function pickVideoAt<T extends { rect: Box }>(items: readonly T[], x: number, y: number): T | undefined {
  let best: T | undefined;
  let bestArea = Infinity;
  for (const item of items) {
    const r = item.rect;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const area = (r.right - r.left) * (r.bottom - r.top);
    if (area < bestArea) { best = item; bestArea = area; }
  }
  return best;
}

/**
 * Düğmenin konumu: normalde sağ üst, X/Twitter'da (sağ üstte kendi düğmeleri var) sol üst.
 * Video kısmen ekran dışındaysa düğme videonun görünen kısmının içinde kalır.
 */
export function pipButtonPosition(
  rect: { left: number; right: number; top: number; bottom?: number },
  hostname: string,
  viewport: { width: number; height: number } = { width: Infinity, height: Infinity }
): { left: number; top: number } {
  const host = hostname.toLowerCase();
  const isX = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
  const visibleLeft = Math.max(rect.left, 0);
  const visibleRight = Math.min(rect.right, viewport.width);
  const visibleTop = Math.max(rect.top, 0);
  const visibleBottom = Math.min(rect.bottom ?? Infinity, viewport.height);
  let left = isX ? visibleLeft + GAP : visibleRight - BUTTON - 12;
  let top = visibleTop + GAP;
  left = Math.max(visibleLeft, Math.min(left, visibleRight - BUTTON));
  top = Math.min(top, visibleBottom - BUTTON);
  return { left, top };
}
