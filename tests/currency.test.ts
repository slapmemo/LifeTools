import { describe, expect, it } from 'vitest';
import { convert, formatTry, parsePrice, ratesToPerTry } from '../src/modules/currency/rates';

describe('currency', () => {
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
