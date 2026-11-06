import { expect, test } from 'vitest';
import { DEFAULT_HOURS, normalizeHours, selectZombies, type ZombieTabLike } from '../src/modules/zombie-tabs/zombie';
import { pushClosed, readClosed, type ClosedPinned } from '../src/modules/pinned-guard/guard';

const HOUR = 3600 * 1000;
const now = 1_000 * HOUR;
const tab = (id: number, extra: Partial<ZombieTabLike> = {}): ZombieTabLike => ({ id, pinned: false, audible: false, active: false, ...extra });

test('zombi seçimi eşiği uygular; sabit, ses çalan ve etkin sekmeleri hariç tutar', () => {
  const last = { '1': now - 30 * HOUR, '2': now - 10 * HOUR, '3': now - 50 * HOUR, '4': now - 50 * HOUR, '5': now - 50 * HOUR, '7': now - 24 * HOUR };
  const result = selectZombies([
    tab(1),
    tab(2),
    tab(3, { pinned: true }),
    tab(4, { audible: true }),
    tab(5, { active: true }),
    tab(6, { lastAccessed: now - 100 * HOUR }),
    tab(7),
    tab(8),
    tab(9, { lastAccessed: now - 100 * HOUR }),
  ], { ...last, '9': now - 1 * HOUR }, now, 24);
  expect(result.map(z => z.tab.id)).toEqual([6, 1]);
  expect(result[0].lastActive).toBe(now - 100 * HOUR);
  expect(selectZombies([tab(2)], last, now, 5).map(z => z.tab.id)).toEqual([2]);
});

test('zombi saat ayarı doğrulanır', () => {
  expect(normalizeHours(undefined)).toBe(DEFAULT_HOURS);
  expect(normalizeHours(-3)).toBe(DEFAULT_HOURS);
  expect(normalizeHours('abc')).toBe(DEFAULT_HOURS);
  expect(normalizeHours('12')).toBe(12);
  expect(normalizeHours(48)).toBe(48);
});

test('son kapanan sabit sekmeler listesi en fazla 10 öğe tutar', () => {
  const entry = (n: number): ClosedPinned => ({ key: `k${n}`, url: `https://s${n}.com`, title: `S${n}`, windowId: 1, closedAt: n });
  let list: ClosedPinned[] = [];
  for (let n = 1; n <= 12; n++) list = pushClosed(list, entry(n));
  expect(list).toHaveLength(10);
  expect(list[0].key).toBe('k12');
  expect(list[9].key).toBe('k3');
  expect(pushClosed(list, entry(5)).filter(e => e.key === 'k5')).toHaveLength(1);
  expect(readClosed([entry(1), { key: 1 }, null])).toEqual([entry(1)]);
  expect(readClosed('x')).toEqual([]);
});
