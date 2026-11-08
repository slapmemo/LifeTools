export const BUBBLE_ENABLED_KEY = 'slapmemoBubbleEnabled';
export const BUBBLE_HIDDEN_KEY = 'slapmemoBubbleHiddenSites';
export const BUBBLE_ORIGINS = ['https://*/*', 'http://*/*'];
import { parseTurkishDue } from '../command-center/search';

const provinces = 'adana|adıyaman|afyonkarahisar|ağrı|amasya|ankara|antalya|artvin|aydın|balıkesir|bilecik|bingöl|bitlis|bolu|burdur|bursa|çanakkale|çankırı|çorum|denizli|diyarbakır|edirne|elazığ|erzincan|erzurum|eskişehir|gaziantep|giresun|gümüşhane|hakkari|hatay|ısparta|mersin|istanbul|izmir|kars|kastamonu|kayseri|kırklareli|kırşehir|kocaeli|konya|kütahya|malatya|manisa|kahramanmaraş|mardin|muğla|muş|nevşehir|niğde|ordu|rize|sakarya|samsun|siirt|sinop|sivas|tekirdağ|tokat|trabzon|tunceli|şanlıurfa|uşak|van|yozgat|zonguldak|aksaray|bayburt|karaman|kırıkkale|batman|şırnak|bartın|ardahan|ığdır|yalova|karabük|kilis|osmaniye|düzce';
export function looksLikeAddress(text: string): boolean {
  const value = text.trim().toLocaleLowerCase('tr-TR');
  if (value.length < 10 || value.length > 200) return false;
  if (/(?:^|[^\p{L}])(?:mah(?:allesi)?|cad(?:desi)?|sok(?:ak)?|bulvarı|blv|apt)(?:\.|(?=$|[^\p{L}]))|(?:^|[^\p{L}])no\s*[:.]/u.test(value)) return true;
  return /(?:^|\D)\d{5}(?:\D|$)/.test(value) && new RegExp(`(?:^|[^\\p{L}])(?:${provinces})(?:$|[^\\p{L}])`, 'u').test(value);
}
export function datedTask(text: string, now: Date): { title: string; due: string } | null {
  const parsed = parseTurkishDue(text, now);
  return parsed.due ? { title: parsed.title.slice(0, 300), due: parsed.due } : null;
}

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
