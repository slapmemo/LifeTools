export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'PLN', 'SEK', 'NOK', 'DKK', 'CZK', 'HUF', 'RUB'] as const;
export type Currency = typeof CURRENCIES[number];
export interface Price { currency: Currency; amount: number }
export interface Rates { date: string; fetchedAt: number; perTry: Record<string, number>; stale?: boolean }
export const RATES_KEY = 'currency.rates';

export function ratesToPerTry(rates: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const code of CURRENCIES) if (Number.isFinite(rates[code]) && rates[code] > 0) result[code] = 1 / rates[code];
  return result;
}
export async function fetchRates(): Promise<Rates> {
  const response = await fetch('https://api.frankfurter.dev/v1/latest?base=TRY');
  if (!response.ok) throw new Error('Kur alınamadı');
  const data = await response.json() as { date: string; rates: Record<string, number> };
  if (typeof data.date !== 'string' || !data.rates || typeof data.rates !== 'object') throw new Error('Geçersiz kur verisi');
  return { date: data.date, fetchedAt: Date.now(), perTry: ratesToPerTry(data.rates) };
}
export async function getRates(): Promise<Rates | null> {
  const data = await chrome.storage.local.get(RATES_KEY);
  const cached = data[RATES_KEY] as Rates | undefined;
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached;
  try { const rates = await fetchRates(); await chrome.storage.local.set({ [RATES_KEY]: rates }); return rates; }
  catch { return cached ? { ...cached, stale: true } : null; }
}
const symbols: Record<string, Currency> = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', 'zł': 'PLN' };
export function parsePrice(text: string): Price | null {
  if (text.length > 40 || /₺|\bTL\b/i.test(text)) return null;
  const match = text.trim().match(/^(?:(USD|EUR|GBP|CHF|JPY|CAD|AUD|PLN|SEK|NOK|DKK|CZK|HUF|RUB|\$|€|£|¥|zł)\s*)?([\d][\d\s.,]*?)(?:\s*(USD|EUR|GBP|CHF|JPY|CAD|AUD|PLN|SEK|NOK|DKK|CZK|HUF|RUB|\$|€|£|¥|zł))?$/i);
  if (!match || (!match[1] && !match[3])) return null;
  const identify = (s: string): Currency | undefined => symbols[s.toLowerCase()] ?? symbols[s] ?? CURRENCIES.find(c => c === s.toUpperCase());
  const currency = identify(match[1] || match[3]);
  if (!currency || (match[1] && match[3] && identify(match[1]) !== identify(match[3]))) return null;
  let number = match[2].trim().replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(number)) return null;
  const comma = number.lastIndexOf(','), dot = number.lastIndexOf('.');
  const last = Math.max(comma, dot);
  const decimal = last >= 0 && number.length - last - 1 !== 3;
  if (decimal) number = number.slice(0, last).replace(/[.,]/g, '') + '.' + number.slice(last + 1);
  else number = number.replace(/[.,]/g, '');
  const amount = Number(number);
  return Number.isFinite(amount) ? { currency, amount } : null;
}
export function findPriceAt(text: string, index: number): (Price & { start: number; end: number }) | null {
  const token = /(?:USD|EUR|GBP|CHF|JPY|CAD|AUD|PLN|SEK|NOK|DKK|CZK|HUF|RUB|\$|€|£|¥|zł)/i;
  const pattern = new RegExp(`(?:${token.source}\\s*\\d[\\d.,]*(?:\\s+${token.source})?|\\d[\\d.,]*\\s*${token.source})`, 'gi');
  let best: (Price & { start: number; end: number }) | null = null;
  let distance = 4;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    if ((start > 0 && /[\p{L}\p{N}₺]/u.test(text[start - 1])) || (end < text.length && /[\p{L}\p{N}]/u.test(text[end]))) continue;
    const price = parsePrice(match[0]);
    if (!price) continue;
    const d = index < start ? start - index : index >= end ? index - end + 1 : 0;
    if (d < distance) { best = { ...price, start, end }; distance = d; }
  }
  return best;
}
export function steamFinalAmount(priceFinalAttr: string | null, text: string | null): Price | null {
  if (!text || /₺|\bTL\b/i.test(text)) return null;
  const parsed = parsePrice(text.trim());
  const currency = parsed?.currency ?? (/\$|\bUSD\b/i.test(text) ? 'USD' : undefined);
  if (!currency) return null;
  if (priceFinalAttr !== null) {
    if (!/^\d+$/.test(priceFinalAttr)) return null;
    const amount = Number(priceFinalAttr) / 100;
    return Number.isFinite(amount) && amount > 0 ? { currency, amount } : null;
  }
  return parsed && parsed.amount > 0 ? parsed : null;
}
export function formatTry(value: number): string { return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`; }
export function convert(price: Price, perTry: Record<string, number>): number | null {
  const rate = perTry[price.currency];
  return Number.isFinite(rate) && rate > 0 ? price.amount * rate : null;
}
