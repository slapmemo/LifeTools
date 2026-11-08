export const BUBBLE_ENABLED_KEY = 'slapmemoBubbleEnabled';
export const BUBBLE_HIDDEN_KEY = 'slapmemoBubbleHiddenSites';
export const BUBBLE_ORIGINS = ['https://*/*', 'http://*/*'];

export function translationTarget(source: string): string { return source.toLowerCase().split('-')[0] === 'tr' ? 'en' : 'tr'; }
export function languageName(code: string): string {
  const names: Record<string, string> = { en: 'İngilizce', tr: 'Türkçe', de: 'Almanca', fr: 'Fransızca', es: 'İspanyolca', it: 'İtalyanca', ru: 'Rusça', ar: 'Arapça', ja: 'Japonca', zh: 'Çince', ko: 'Korece', pt: 'Portekizce', nl: 'Felemenkçe' };
  return names[code.toLowerCase().split('-')[0]] ?? code;
}
export function translationText(text: string): string { return text.trim().slice(0, 5000); }
export function translationAvailabilityState(availability: 'unavailable' | 'downloadable' | 'downloading' | 'available'): 'unsupported' | 'downloading' | 'translating' {
  return availability === 'unavailable' ? 'unsupported' : availability === 'available' ? 'translating' : 'downloading';
}

export function selectionUrl(text: string): string | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' ? value : null; } catch { return null; }
}

export function bubbleButtons(text: string, flags: unknown): string[] {
  const enabled = (id: string) => typeof flags !== 'object' || flags === null || (flags as Record<string, unknown>)[id] !== false;
  return ['slapmemo', 'quick-tasks', 'watchlist', ...(selectionUrl(text) ? ['link-cleaner'] : []), 'clip-slots'].filter(enabled);
}

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
