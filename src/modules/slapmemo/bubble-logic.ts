export const BUBBLE_ENABLED_KEY = 'slapmemoBubbleEnabled';
export const BUBBLE_HIDDEN_KEY = 'slapmemoBubbleHiddenSites';
export const BUBBLE_ORIGINS = ['https://*/*', 'http://*/*'];

const provinces = 'adana|adıyaman|afyonkarahisar|ağrı|amasya|ankara|antalya|artvin|aydın|balıkesir|bilecik|bingöl|bitlis|bolu|burdur|bursa|çanakkale|çankırı|çorum|denizli|diyarbakır|edirne|elazığ|erzincan|erzurum|eskişehir|gaziantep|giresun|gümüşhane|hakkari|hatay|ısparta|mersin|istanbul|izmir|kars|kastamonu|kayseri|kırklareli|kırşehir|kocaeli|konya|kütahya|malatya|manisa|kahramanmaraş|mardin|muğla|muş|nevşehir|niğde|ordu|rize|sakarya|samsun|siirt|sinop|sivas|tekirdağ|tokat|trabzon|tunceli|şanlıurfa|uşak|van|yozgat|zonguldak|aksaray|bayburt|karaman|kırıkkale|batman|şırnak|bartın|ardahan|ığdır|yalova|karabük|kilis|osmaniye|düzce';
export function looksLikeAddress(text: string): boolean {
  const value = text.trim().toLocaleLowerCase('tr-TR');
  if (value.length < 10 || value.length > 200) return false;
  if (/(?:^|[^\p{L}])(?:mah(?:allesi)?|cad(?:desi)?|sok(?:ak)?|bulvarı|blv|apt)(?:\.|(?=$|[^\p{L}]))|(?:^|[^\p{L}])no\s*[:.]/u.test(value)) return true;
  return /(?:^|\D)\d{5}(?:\D|$)/.test(value) && new RegExp(`(?:^|[^\\p{L}])(?:${provinces})(?:$|[^\\p{L}])`, 'u').test(value);
}
export function datedTask(text: string, now: Date): { title: string; due: string } | null {
  const value = text.toLocaleLowerCase('tr-TR');
  const months = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
  const days = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
  const pattern = /(?<![\p{L}\p{N}])(?:öbür\s+gün|yarın|bugün|haftaya|pazartesi|salı|çarşamba|perşembe|cumartesi|cuma|pazar|\d{1,2}\s+(?:ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)(?:\s+\d{4})?|\d{1,2}[./]\d{1,2}(?:[./]\d{4})?)(?:['’](?:da|de|ta|te|a|e|ya|ye))?(?:\s+günü)?(?![\p{L}\p{N}])/u;
  const match = pattern.exec(value);
  if (!match) return null;
  const phrase = match[0].replace(/['’](?:da|de|ta|te|a|e|ya|ye)(?=\s|$)/u, '').replace(/\s+günü$/, '');
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = date.getTime();
  const weekday = days.indexOf(phrase);
  if (phrase === 'yarın') date.setDate(date.getDate() + 1);
  else if (phrase === 'öbür gün') date.setDate(date.getDate() + 2);
  else if (phrase === 'haftaya') date.setDate(date.getDate() + 7);
  else if (weekday >= 0) date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7 || 7));
  else if (phrase !== 'bugün') {
    const numeric = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/.exec(phrase);
    const named = /^(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?$/u.exec(phrase);
    if (!numeric && !named) return null;
    const day = Number((numeric ?? named)![1]);
    const month = numeric ? Number(numeric[2]) - 1 : months.indexOf(named![2]);
    const yearText = (numeric ?? named)![3];
    const year = yearText ? Number(yearText) : now.getFullYear();
    date.setFullYear(year, month, day);
    if (month < 0 || month > 11 || date.getMonth() !== month || date.getDate() !== day) return null;
    if (!yearText && date.getTime() < today) {
      date.setFullYear(year + 1);
      if (date.getMonth() !== month || date.getDate() !== day) return null;
    }
  }
  let end = match.index + match[0].length;
  const timeMatch = /^\s+(?:(saat)\s+)?(\d{1,2})(?:[:.](\d{2}))?(['’](?:da|de|ta|te))?(?![\p{L}\p{N}])/u.exec(value.slice(end));
  let time = '';
  if (timeMatch && (timeMatch[1] || timeMatch[3] || timeMatch[4]) && Number(timeMatch[2]) < 24 && Number(timeMatch[3] ?? 0) < 60) {
    time = ` ${timeMatch[2].padStart(2, '0')}:${timeMatch[3] ?? '00'}`;
    end += timeMatch[0].length;
  }
  const title = `${text.slice(0, match.index)} ${text.slice(end)}`.trim().replace(/\s+/g, ' ') || text.trim();
  const due = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}${time}`;
  return { title: title.slice(0, 300), due };
}

export function translationTarget(source: string): string { return source.toLowerCase().split('-')[0] === 'tr' ? 'en' : 'tr'; }
export function languageName(code: string): string {
  const names: Record<string, string> = { en: 'İngilizce', tr: 'Türkçe', de: 'Almanca', fr: 'Fransızca', es: 'İspanyolca', it: 'İtalyanca', ru: 'Rusça', ar: 'Arapça', ja: 'Japonca', zh: 'Çince', ko: 'Korece', pt: 'Portekizce', nl: 'Felemenkçe' };
  return names[code.toLowerCase().split('-')[0]] ?? code;
}
export function translationText(text: string): string { return text.trim().slice(0, 5000); }

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
