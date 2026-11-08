import { describe, expect, it } from 'vitest';
import { nextLabel, sortByMru } from '../src/modules/tab-switcher/filter';
describe('sekme değiştirici', () => {
 it('sıralamayı son etkinliğe göre yapar ve bilinmeyenlerin sırasını korur', () => {
  expect(sortByMru([{id: 1}, {id: 2}, {id: 3}, {id: 4}], [3, 1]).map(x => x.id)).toEqual([3, 1, 2, 4]);
 });
 it('etiketleri döngüyle değiştirir', () => {
  expect(['', 'Önemli', 'Sonra Bak', 'Araştırma', 'başka'].map(nextLabel)).toEqual(['Önemli', 'Sonra Bak', 'Araştırma', '', '']);
 });
});
