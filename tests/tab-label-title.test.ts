import { describe, expect, it } from 'vitest';
import { labelTitle } from '../src/modules/tab-labels/title-logic';

describe('sekme başlığı etiketi', () => {
  it('etiketi ekler, değiştirir ve kaldırır', () => {
    expect(labelTitle('Sayfa', 'Önemli')).toBe('⭐ Sayfa');
    expect(labelTitle('⭐ Sayfa', 'Önemli')).toBe('⭐ Sayfa');
    expect(labelTitle('⭐ Sayfa', 'Sonra Bak')).toBe('🕒 Sayfa');
    expect(labelTitle('🕒 🔎 Sayfa', 'Araştırma')).toBe('🔎 Sayfa');
    expect(labelTitle('⭐ Sayfa', '')).toBe('Sayfa');
    expect(labelTitle('Sayfa', 'Özel')).toBe('Sayfa');
  });
});
