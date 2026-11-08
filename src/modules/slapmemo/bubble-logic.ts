export const BUBBLE_ENABLED_KEY = 'slapmemoBubbleEnabled';
export const BUBBLE_HIDDEN_KEY = 'slapmemoBubbleHiddenSites';
export const BUBBLE_ORIGINS = ['https://*/*', 'http://*/*'];

export function shouldShowBubble(text: string, editable: boolean, hostname: string, hiddenSites: readonly string[], enabled: boolean): boolean {
  return enabled && !editable && text.trim().length >= 2 && !hiddenSites.includes(hostname);
}

export function bubblePosition(rect: { left: number; right: number; top: number; bottom: number }, viewport: { width: number; height: number }, size: { width: number; height: number }): { left: number; top: number } {
  const gap = 8;
  const left = Math.max(0, Math.min(rect.right - size.width / 2, viewport.width - size.width));
  const above = rect.top - size.height - gap;
  const top = Math.max(0, Math.min(above >= 0 ? above : rect.bottom + gap, viewport.height - size.height));
  return { left, top };
}
