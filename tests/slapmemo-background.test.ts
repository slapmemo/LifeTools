import { expect, test } from 'vitest';
import { pickSave } from '../src/modules/slapmemo/background';

test('kayıt seçimi, bağlantıyı ve sayfayı öncelik sırasıyla seçer', () => {
  expect(pickSave({ selectionText: ' seçili ', linkUrl: 'https://link', pageTitle: 'Başlık' })).toEqual({ text: 'seçili', category: 'note' });
  expect(pickSave({ selectionText: ' ', linkUrl: 'https://link', pageTitle: 'Başlık' })).toEqual({ text: 'https://link', category: 'read' });
  expect(pickSave({ pageTitle: 'Başlık', pageUrl: 'https://page' })).toEqual({ text: 'Başlık', category: 'read' });
  expect(pickSave({ pageUrl: 'https://page' })).toEqual({ text: 'https://page', category: 'read' });
});
