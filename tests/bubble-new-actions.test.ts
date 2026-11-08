import { describe, expect, it } from 'vitest';
import { datedTask, looksLikeAddress } from '../src/modules/slapmemo/bubble-logic';

describe('selection actions', () => {
  it('recognizes Turkish address markers and postcodes with provinces', () => {
    for (const value of ['Atatürk Mah. No: 12', 'İstiklal Caddesi 15', 'Merkez Sokak 3', 'Cumhuriyet Bulvarı 8', '34000 İSTANBUL', '35200 İzmir']) expect(looksLikeAddress(value)).toBe(true);
    for (const value of ['Merhaba dünya', '12345 başka yer', 'İstanbul güzel bir şehir', 'Mah.', 'x'.repeat(201)]) expect(looksLikeAddress(value)).toBe(false);
  });
  it('extracts dates and preserves a usable title', () => {
    const now = new Date(2026, 10, 8, 12);
    expect(datedTask('Faturayı öde yarın 15:00', now)).toEqual({ title: 'Faturayı öde', due: '2026-11-09 15:00' });
    expect(datedTask('12 Kasım', now)).toEqual({ title: '12 Kasım', due: '2026-11-12' });
    expect(datedTask('Ara pazartesi', now)).toEqual({ title: 'Ara', due: '2026-11-09' });
    expect(datedTask('Sıradan bir metin', now)).toBeNull();
  });
  it('finds dates and associated times throughout a selection', () => {
    const now = new Date(2026, 10, 8, 12);
    const cases: Array<[string, string, string]> = [
      ['yarın 15:00 toplantı', 'toplantı', '2026-11-09 15:00'],
      ["12 Kasım'da sunum", 'sunum', '2026-11-12'],
      ['Pazartesi saat 10:30 diş hekimi', 'diş hekimi', '2026-11-09 10:30'],
      ["toplantı yarın saat 9'da", 'toplantı', '2026-11-09 09:00'],
      ["pazartesi'ye iş", 'iş', '2026-11-09'],
      ['cuma günü iş', 'iş', '2026-11-13'],
      ['öbür gün iş', 'iş', '2026-11-10'],
      ['haftaya iş', 'iş', '2026-11-15'],
      ['bugün saat 15 iş', 'iş', '2026-11-08 15:00'],
      ['12.11 15.30 iş', 'iş', '2026-11-12 15:30'],
      ['iş 12/11/2026', 'iş', '2026-11-12'],
      ['iş 01.01', 'iş', '2027-01-01']
    ];
    for (const [input, title, due] of cases) expect(datedTask(input, now), input).toEqual({ title, due });
    for (const input of ['2026 yılında', '15 kişi', 'plain text', 'iş 31.02']) expect(datedTask(input, now), input).toBeNull();
  });
});
