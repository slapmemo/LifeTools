import { describe, expect, it } from 'vitest';
import { convert, findPriceAt, formatTry, isStandalonePriceText, parsePrice, ratesToPerTry, steamFinalAmount } from '../src/modules/currency/rates';
import { priceCandidate } from '../src/modules/currency/hover';

describe('currency', () => {
  it('recognizes standalone Steam price text', () => {
    for (const text of ['$1.97 USD', '$6.59', '12,99€']) expect(isStandalonePriceText(text)).toBe(true);
    for (const text of ['Ücretsiz', '$1.97 USD indirim', '₺50', '2026']) expect(isStandalonePriceText(text)).toBe(false);
  });
  it('reads Steam final amounts', () => {
    expect(steamFinalAmount('647', '$6.47 USD')).toEqual({ currency: 'USD', amount: 6.47 });
    expect(steamFinalAmount(null, '$5.79 USD')).toEqual({ currency: 'USD', amount: 5.79 });
    expect(steamFinalAmount('0', '$0.00 USD')).toBeNull();
    expect(steamFinalAmount('5000', '₺50')).toBeNull();
  });
  it('finds prices within sentences', () => {
    for (const [text, needle, currency, amount] of [
      ['Sadece €5 bugün', '5', 'EUR', 5],
      ['Fiyat 5€ oldu', '5', 'EUR', 5],
      ['toplam $12.99 USD ödendi', '12', 'USD', 12.99]
    ] as const) {
      expect(findPriceAt(text, text.indexOf(needle))).toMatchObject({ currency, amount });
    }
    expect(findPriceAt('fiyat yok', 3)).toBeNull();
    expect(findPriceAt('₺50', 1)).toBeNull();
    for (const [text, currency, amount] of [
      ['€ 5,99', 'EUR', 5.99], ['12.99 USD', 'USD', 12.99],
      ['USD 12.99', 'USD', 12.99], ['£5', 'GBP', 5],
      ['¥1,200', 'JPY', 1200], ['CHF 10', 'CHF', 10], ['10 zł', 'PLN', 10]
    ] as const) {
      expect(findPriceAt(text, text.indexOf(text.match(/\d/)![0]))).toMatchObject({ currency, amount });
    }
  });
  it('selects only small price candidates', () => {
    expect(priceCandidate('  € 12,50  ', 3)).toEqual({ currency: 'EUR', amount: 12.5 });
    expect(priceCandidate('€12', 4)).toBeNull();
    expect(priceCandidate('$' + '1'.repeat(40), 0)).toBeNull();
    expect(priceCandidate('not a price', 0)).toBeNull();
  });
  it.each([
    ['$12.99', 'USD', 12.99], ['$12.99 USD', 'USD', 12.99],
    ['12,99€', 'EUR', 12.99], ['€ 1.234,56', 'EUR', 1234.56],
    ['£5', 'GBP', 5], ['USD 7.50', 'USD', 7.5],
    ['1 299,00 zł', 'PLN', 1299], ['¥1,200', 'JPY', 1200]
  ] as const)('parses %s', (text, currency, amount) => {
    expect(parsePrice(text)).toEqual({ currency, amount });
  });
  it.each(['₺50', '50 TL', '$12.99 per month', '$' + '1'.repeat(41), '12.99'])('rejects %s', text => {
    expect(parsePrice(text)).toBeNull();
  });
  it('converts and formats with two decimal places', () => {
    expect(convert({ currency: 'USD', amount: 10 }, { USD: 123.456 })).toBe(1234.56);
    expect(convert({ currency: 'EUR', amount: 1 }, {})).toBeNull();
    expect(formatTry(1234.56)).toBe('1.234,56 ₺');
  });
  it('inverts supported Frankfurter rates', () => {
    expect(ratesToPerTry({ USD: 0.025, EUR: 0.02, RUB: 0, XYZ: 1 })).toEqual({ USD: 40, EUR: 50 });
  });
});
