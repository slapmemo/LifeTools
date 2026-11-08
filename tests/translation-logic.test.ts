import { describe, expect, it } from 'vitest';
import { languageName, translationAvailabilityState, translationTarget, translationText } from '../src/modules/slapmemo/bubble-logic';

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
  it('maps each availability state', () => {
    expect(translationAvailabilityState('unavailable')).toBe('unsupported');
    expect(translationAvailabilityState('downloadable')).toBe('downloading');
    expect(translationAvailabilityState('downloading')).toBe('downloading');
    expect(translationAvailabilityState('available')).toBe('translating');
  });
});
