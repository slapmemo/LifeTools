import { describe, expect, it } from 'vitest';
import { cleanUrl } from '../src/modules/link-cleaner/clean';

describe('cleanUrl', () => {
  it('utm parametrelerini kaldırır ve diğerlerinin sırasını ve kodlamasını korur', () => {
    expect(cleanUrl('https://example.com/?a=hello%20world&utm_source=x&b=2&a=3')).toEqual({
      url: 'https://example.com/?a=hello%20world&b=2&a=3', removed: ['utm_source']
    });
  });
  it('fbclid ve gclid kaldırır', () => {
    expect(cleanUrl('https://example.com/?fbclid=x&gclid=y')).toEqual({ url: 'https://example.com/', removed: ['fbclid', 'gclid'] });
  });
  it('X parametrelerini kaldırır', () => {
    expect(cleanUrl('https://x.com/user?s=20&t=abc')).toEqual({ url: 'https://x.com/user', removed: ['s', 't'] });
  });
  it('YouTube si parametresini kaldırıp v ve t parametrelerini korur', () => {
    expect(cleanUrl('https://www.youtube.com/watch?v=abc&si=123&t=42')).toEqual({ url: 'https://www.youtube.com/watch?v=abc&t=42', removed: ['si'] });
  });
  it('Amazon ref parametresini kaldırıp psc parametresini korur', () => {
    expect(cleanUrl('https://www.amazon.co.uk/item?ref=x&psc=1')).toEqual({ url: 'https://www.amazon.co.uk/item?psc=1', removed: ['ref'] });
  });
  it('hash korur', () => {
    expect(cleanUrl('https://example.com/?utm_a=x#section')?.url).toBe('https://example.com/#section');
  });
  it('parametresiz URL değişmez', () => {
    expect(cleanUrl('https://example.com/path')).toEqual({ url: 'https://example.com/path', removed: [] });
  });
  it('parametre adını büyük küçük harfe duyarsız eşleştirir', () => {
    expect(cleanUrl('https://example.com/?UTM_Source=x')?.removed).toEqual(['UTM_Source']);
  });
  it('HTTP dışı ve geçersiz URL için null döner', () => {
    expect(cleanUrl('ftp://example.com/')).toBeNull();
    expect(cleanUrl('not a url')).toBeNull();
  });
  it('sondaki soru işaretini kaldırır', () => {
    expect(cleanUrl('https://example.com/path?#hash')?.url).toBe('https://example.com/path#hash');
  });
});
