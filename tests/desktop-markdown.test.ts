import { expect, test } from 'vitest';
import { extractTags, toggleTaskLine } from '../desktop/src/markdown';

test('etiketler: satır başı ve boşluktan sonra, başlıklar ve adres parçaları hariç', () => {
  expect(extractTags('Toplantı #İş ve #film_listesi\n# Başlık değil etiket\nhttps://ornek.com/#bolum a#b')).toEqual(['#iş', '#film_listesi']);
  expect(extractTags('#iş tekrar #İŞ')).toEqual(['#iş']);
  expect(extractTags('(#parantez) içinde')).toEqual(['#parantez']);
});

test('yapılacak kutucuğu yalnız hedef satırda değişir', () => {
  const text = 'Liste\n- [ ] süt\n  * [x] ekmek\nnormal satır';
  expect(toggleTaskLine(text, 1, true)).toBe('Liste\n- [x] süt\n  * [x] ekmek\nnormal satır');
  expect(toggleTaskLine(text, 2, false)).toBe('Liste\n- [ ] süt\n  - [ ] ekmek\nnormal satır');
  expect(toggleTaskLine(text, 3, true)).toBe(text);
  expect(toggleTaskLine(text, 99, true)).toBe(text);
});
