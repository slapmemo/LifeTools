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

export function visibleVideoRect(video: HTMLVideoElement): Rect | null {
  if (isExploreGridVideo(location.pathname, video.closest('[role="dialog"]') !== null)) return null;
  if (!video.isConnected) return null;
  const dialogs = document.querySelectorAll('[role="dialog"]');
  let topDialog: Element | undefined;
  for (const dialog of dialogs) {
    if (!dialog.isConnected) continue;
    const rect = dialog.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) topDialog = dialog;
  }
  if (topDialog && !topDialog.contains(video)) return null;
  const original = video.getBoundingClientRect();
  const clips: Rect[] = [];
  for (let element: HTMLElement | null = video; element; element = element.parentElement) {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return null;
    if (element !== video && [style.overflow, style.overflowX, style.overflowY].some(value => value !== 'visible')) clips.push(element.getBoundingClientRect());
    if (element === document.documentElement) break;
  }
  const clipped = clipRect(original, clips, { width: innerWidth, height: innerHeight });
  return isMostlyVisible(original, clipped) ? clipped : null;
}
