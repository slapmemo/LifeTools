import { describe, expect, it } from 'vitest';
import { normalizeNoteUrl } from '../src/modules/slapmemo/repo';
import { noteCountText } from '../src/modules/slapmemo/page-hint';

describe('sayfa notu hatırlatıcısı', () => {
  it('parçayı ve yolun sonundaki bölüyü kaldırır, sorguyu korur', () => {
    expect(normalizeNoteUrl('https://example.com/path/?a=1#part')).toBe('https://example.com/path?a=1');
    expect(normalizeNoteUrl('https://example.com/#part')).toBe('https://example.com');
    expect(normalizeNoteUrl('https://example.com/path?next=/')).toBe('https://example.com/path?next=/');
  });
  it('not sayısını gösterir', () => {
    expect(noteCountText(1)).toBe('📝 Bu sayfada 1 notun var');
    expect(noteCountText(2)).toBe('📝 Bu sayfada 2 notun var');
  });
});
