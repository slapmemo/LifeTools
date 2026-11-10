export type Rect = { left: number; top: number; right: number; bottom: number; width: number; height: number };

export function clipRect(rect: Rect, clips: Rect[], viewport: { width: number; height: number }): Rect | null {
  let left = Math.max(rect.left, 0); let top = Math.max(rect.top, 0);
  let right = Math.min(rect.right, viewport.width); let bottom = Math.min(rect.bottom, viewport.height);
  for (const clip of clips) {
    left = Math.max(left, clip.left); top = Math.max(top, clip.top);
    right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
  }
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function isMostlyVisible(original: Rect, clipped: Rect | null, minFraction = 0.5): boolean {
  return !!clipped && original.width > 0 && original.height > 0 && clipped.width >= 80 && clipped.height >= 80
    && clipped.width * clipped.height / (original.width * original.height) >= minFraction;
}

export function isExploreGridVideo(pathname: string, insideDialog: boolean): boolean {
  return !insideDialog && (pathname === '/explore' || pathname.startsWith('/explore/'));
}

export function isUncovered(videoArea: number, commonAncestorArea: number, maxRatio = 2.5): boolean {
  return videoArea > 0 && commonAncestorArea <= videoArea * maxRatio;
}

export function isModalDialogRect(rect: Rect, viewport: { width: number; height: number }, ariaModal: boolean): boolean {
  if (ariaModal) return true;
  const clipped = clipRect(rect, [], viewport);
  return !!clipped && viewport.width > 0 && viewport.height > 0
    && clipped.width * clipped.height >= viewport.width * viewport.height * 0.4;
}

const visibilityCache = new Map<HTMLVideoElement, Rect | null>();
let cachedTopDialog: Element | null | undefined;
let cacheClearFrame = 0;

export function clearVisibilityCache(): void {
  visibilityCache.clear();
  cachedTopDialog = undefined;
  if (cacheClearFrame) cancelAnimationFrame(cacheClearFrame);
  cacheClearFrame = 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', clearVisibilityCache, true);
  window.addEventListener('resize', clearVisibilityCache);
}

export function visibleVideoRect(video: HTMLVideoElement): Rect | null {
  if (visibilityCache.has(video)) return visibilityCache.get(video)!;
  const result = calculateVisibleVideoRect(video);
  visibilityCache.set(video, result);
  if (!cacheClearFrame) cacheClearFrame = requestAnimationFrame(clearVisibilityCache);
  return result;
}

function calculateVisibleVideoRect(video: HTMLVideoElement): Rect | null {
  if (!video.isConnected) return null;
  if (isExploreGridVideo(location.pathname, video.closest('[role="dialog"]') !== null)) return null;
  const original = video.getBoundingClientRect();
  const viewport = { width: innerWidth, height: innerHeight };
  if (!isMostlyVisible(original, clipRect(original, [], viewport))) return null;
  if (cachedTopDialog === undefined) {
    cachedTopDialog = null;
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (!dialog.isConnected) continue;
      const rect = dialog.getBoundingClientRect();
      if (isModalDialogRect(rect, viewport, dialog.getAttribute('aria-modal') === 'true')) cachedTopDialog = dialog;
    }
  }
  if (cachedTopDialog && !cachedTopDialog.contains(video)) return null;
  const clips: Rect[] = [];
  for (let element: HTMLElement | null = video; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    if (element !== video && element !== document.documentElement && element !== document.body && [style.overflow, style.overflowX, style.overflowY].some(value => value !== 'visible')) clips.push(element.getBoundingClientRect());
    if (element === document.documentElement) break;
  }
  const clipped = clipRect(original, clips, { width: innerWidth, height: innerHeight });
  if (!clipped || !isMostlyVisible(original, clipped)) return null;
  for (const [x, y] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const top = document.elementsFromPoint(clipped.left + clipped.width * x, clipped.top + clipped.height * y)
      .find(element => !element.closest('[data-lifetools-instagram]'));
    if (!top) continue;
    if (top === document.documentElement || top === document.body || top === video || video.contains(top) || top.contains(video)) return clipped;
    let ancestor: Element | null = video.parentElement;
    while (ancestor && !ancestor.contains(top)) ancestor = ancestor.parentElement;
    if (!ancestor) continue;
    const ancestorRect = clipRect(ancestor.getBoundingClientRect(), [], viewport);
    const ancestorArea = ancestorRect ? ancestorRect.width * ancestorRect.height : 0;
    if (isUncovered(clipped.width * clipped.height, ancestorArea)) return clipped;
  }
  return null;
}
