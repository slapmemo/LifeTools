import { describe, expect, it } from 'vitest';
import { looksLikeAddress } from '../src/modules/slapmemo/bubble-logic';

describe('selection actions', () => {
  it('recognizes Turkish address markers and postcodes with provinces', () => {
    for (const value of ['Atatürk Mah. No: 12', 'İstiklal Caddesi 15', 'Merkez Sokak 3', 'Cumhuriyet Bulvarı 8', '34000 İSTANBUL', '35200 İzmir']) expect(looksLikeAddress(value)).toBe(true);
    for (const value of ['Merhaba dünya', '12345 başka yer', 'İstanbul güzel bir şehir', 'Mah.', 'x'.repeat(201)]) expect(looksLikeAddress(value)).toBe(false);
  });
});
