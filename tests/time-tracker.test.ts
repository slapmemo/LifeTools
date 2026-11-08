import { expect, it } from 'vitest';
import { initialState, onEvent, siteKey, splitByDay } from '../src/modules/time-tracker/tracker';
import { createTimeTrackerRepo } from '../src/modules/time-tracker/repo';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';
import { formatDuration } from '../src/modules/time-tracker/panel';
import { crossedThresholds } from '../src/modules/time-tracker/limits';
import { todayTimeLine } from '../src/popup/summary';

it('detects limit crossings', () => {
  expect(crossedThresholds(0, 60, 5)).toEqual([]);
  expect(crossedThresholds(239, 240, 5)).toEqual(['80']);
  expect(crossedThresholds(299, 300, 5)).toEqual(['100']);
  expect(crossedThresholds(0, 300, 5)).toEqual(['80', '100']);
  expect(crossedThresholds(300, 400, 5)).toEqual([]);
});
it('builds the today line', () => {
  expect(todayTimeLine([])).toBe('Bugün henüz süre kaydı yok');
  expect(todayTimeLine([{ domain: 'a.com', seconds: 3900 }, { domain: 'b.com', seconds: 7500 }])).toBe('Bugün: 3 sa 10 dk · en çok b.com (2 sa 5 dk)');
});

it('recognizes web domains', () => {
  expect(siteKey('https://WWW.Example.com/path')).toBe('example.com');
  for (const url of ['chrome://newtab', 'file:///a', 'chrome-extension://abc/a', 'invalid']) expect(siteKey(url)).toBeNull();
});
it('splits local days', () => {
  const start = new Date(2024, 0, 1, 23, 59, 30).getTime();
  expect(splitByDay('a', start, start + 60000)).toEqual([{day:'2024-01-01',domain:'a',seconds:30}, {day:'2024-01-02',domain:'a',seconds:30}]);
});
it('tracks transitions and caps stale segments', () => {
  let state = initialState();
  state = onEvent(state, {type:'windowFocus', focused:true}, 0).state;
  state = onEvent(state, {type:'idle', idle:'active'}, 0).state;
  state = onEvent(state, {type:'activeUrl', url:'https://a.test'}, 0).state;
  let r = onEvent(state, {type:'activeUrl', url:'https://b.test'}, 10000);
  expect(r.chunks[0]).toMatchObject({domain:'a.test', seconds:10});
  r = onEvent(r.state, {type:'windowFocus', focused:false}, 20000);
  expect(r.chunks[0].seconds).toBe(10); expect(r.state.segment).toBeNull();
  state = onEvent(r.state, {type:'windowFocus', focused:true}, 30000).state;
  r = onEvent(state, {type:'idle', idle:'idle'}, 40000); expect(r.state.segment).toBeNull();
  state = onEvent(r.state, {type:'idle', idle:'active'}, 50000).state;
  r = onEvent(state, {type:'flush'}, 60000); expect(r.chunks[0].seconds).toBe(10); expect(r.state.segment?.startMs).toBe(60000);
  r = onEvent(r.state, {type:'flush'}, 4000000); expect(r.chunks.reduce((n,c) => n+c.seconds,0)).toBe(120);
  expect(onEvent(r.state, {type:'activeUrl', url:'chrome://newtab'}, 4001000).state.segment).toBeNull();
});
it('formats durations', () => { expect(formatDuration(4320)).toBe('1 sa 12 dk'); expect(formatDuration(30)).toBe('30 sn'); });
it('upserts, orders, sums and deletes', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex); const repo = createTimeTrackerRepo(ex);
  await repo.addChunks([{day:'2024-01-01',domain:'a',seconds:10}, {day:'2024-01-01',domain:'a',seconds:5}, {day:'2024-01-01',domain:'b',seconds:20}, {day:'2024-01-02',domain:'a',seconds:30}]);
  expect(await repo.getDay('2024-01-01')).toEqual([{domain:'b',seconds:20},{domain:'a',seconds:15}]);
  expect(await repo.getRange('2024-01-01','2024-01-02')).toEqual([{domain:'a',seconds:45},{domain:'b',seconds:20}]);
  await repo.deleteDomain('a'); expect(await repo.getDay('2024-01-02')).toEqual([]);
  await repo.deleteAll(); expect(await repo.getDay('2024-01-01')).toEqual([]);
});
