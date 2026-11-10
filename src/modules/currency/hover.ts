import { parsePrice, type Price } from './rates';

export function priceCandidate(text: string, childCount: number): Price | null {
  const trimmed = text.trim();
  return trimmed.length <= 40 && childCount <= 3 ? parsePrice(trimmed) : null;
}
