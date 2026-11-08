import { describe, expect, it } from 'vitest';
import { languageName, translationTarget, translationText } from '../src/modules/slapmemo/bubble-logic';
import { buildTranslationRequest, parseTranslation } from '../src/modules/slapmemo/translate';

describe('translation helpers', () => {
  it('chooses English for Turkish and Turkish for other languages', () => {
    expect(translationTarget('tr-TR')).toBe('en');
    expect(translationTarget('de')).toBe('tr');
  });
  it('displays language names and falls back to the code', () => {
    expect(languageName('en')).toBe('İngilizce');
    expect(languageName('tr')).toBe('Türkçe');
    expect(languageName('xx')).toBe('xx');
  });
  it('trims and limits input to 5000 characters', () => {
    expect(translationText('  hello  ')).toBe('hello');
    expect(translationText(` ${'a'.repeat(5001)} `)).toHaveLength(5000);
  });
  it('parses segments and rejects malformed responses', () => {
    expect(parseTranslation([[['Merhaba', 'Hello'], [' dünya', ' world']], null, 'en'])).toEqual({ text: 'Merhaba dünya', source: 'en' });
    for (const value of [null, [], [[], null, 'en'], [[['x']], null], [[[null]], null, 'tr']]) expect(parseTranslation(value)).toBeNull();
  });
  it('encodes GET and POST requests', () => {
    const get = buildTranslationRequest('çığ şü', 'tr');
    expect(new URL(get.url).searchParams.get('q')).toBe('çığ şü');
    expect(get.init.credentials).toBe('omit');
    const post = buildTranslationRequest('çığ şü'.repeat(400), 'en');
    expect(post.init.method).toBe('POST');
    expect(new URL(post.url).searchParams.has('q')).toBe(false);
    expect(new URLSearchParams(post.init.body as string).get('q')).toBe('çığ şü'.repeat(400));
  });
});
