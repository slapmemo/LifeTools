import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  DESKTOP_UNREACHABLE, MAX_REQUEST_BYTES, NativeClient, createNativeExecutor, executorTransport,
  type PortLike
} from '../src/db/native';

class FakePort implements PortLike {
  sent: any[] = [];
  disconnected = false;
  private messageListeners: ((m: any) => void)[] = [];
  private disconnectListeners: (() => void)[] = [];
  onMessage = { addListener: (cb: (m: any) => void) => { this.messageListeners.push(cb); } };
  onDisconnect = { addListener: (cb: () => void) => { this.disconnectListeners.push(cb); } };
  postMessage(m: unknown) { this.sent.push(m); }
  disconnect() { this.disconnected = true; }
  reply(m: unknown) { this.messageListeners.forEach(cb => cb(m)); }
  drop() { this.disconnectListeners.forEach(cb => cb()); }
}

let ports: FakePort[];
const connect = () => { const p = new FakePort(); ports.push(p); return p; };

beforeEach(() => { ports = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

test('yanıtlar id ile eşleşir (sırasız gelse de)', async () => {
  const client = new NativeClient({ connect });
  const a = client.request({ op: 'query', sql: 'A' });
  const b = client.request({ op: 'query', sql: 'B' });
  const [p] = ports;
  expect(p.sent.map(m => m.sql)).toEqual(['A', 'B']);
  p.reply({ id: p.sent[1].id, ok: true, rows: [{ x: 'b' }] });
  p.reply({ id: p.sent[0].id, ok: true, rows: [{ x: 'a' }] });
  expect((await a).rows).toEqual([{ x: 'a' }]);
  expect((await b).rows).toEqual([{ x: 'b' }]);
  expect(ports).toHaveLength(1); // tek port
});

test('ok:false yanıtı hata olarak reddedilir; bilinmeyen id yok sayılır', async () => {
  const client = new NativeClient({ connect });
  const r = client.request({ op: 'exec', sql: 'X' });
  const [p] = ports;
  p.reply({ id: 999, ok: true });
  p.reply({ id: p.sent[0].id, ok: false, error: 'no such table: x' });
  await expect(r).rejects.toThrow('no such table: x');
});

test('10 sn içinde yanıt gelmezse zaman aşımı', async () => {
  const client = new NativeClient({ connect });
  const r = client.request({ op: 'ping' });
  const caught = r.catch(e => e as Error);
  await vi.advanceTimersByTimeAsync(9_999);
  expect(ports[0].sent).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(2);
  expect((await caught).message).toContain('zaman aşımı');
  // geç gelen yanıt zararsız
  ports[0].reply({ id: ports[0].sent[0].id, ok: true });
});

test('kopma bekleyen istekleri reddeder ve sonraki istekte yeniden bağlanır', async () => {
  const onDisconnect = vi.fn();
  const client = new NativeClient({ connect, onDisconnect });
  const first = client.request({ op: 'ping' });
  const firstCaught = first.catch(e => e as Error);
  ports[0].drop();
  expect((await firstCaught).message).toBe(DESKTOP_UNREACHABLE);
  expect(onDisconnect).toHaveBeenCalledTimes(1);
  expect(client.connected).toBe(false);
  const second = client.request({ op: 'ping' });
  expect(ports).toHaveLength(2);
  ports[1].reply({ id: ports[1].sent[0].id, ok: true, app: 'LifeTools' });
  expect((await second).app).toBe('LifeTools');
});

test('bağlanma hatası ve postMessage hatası Türkçe hata verir', async () => {
  const failing = new NativeClient({ connect: () => { throw new Error('boom'); } });
  await expect(failing.request({ op: 'ping' })).rejects.toThrow(DESKTOP_UNREACHABLE);
  const bad = new NativeClient({ connect: () => { const p = new FakePort(); p.postMessage = () => { throw new Error('closed'); }; ports.push(p); return p; } });
  await expect(bad.request({ op: 'ping' })).rejects.toThrow(DESKTOP_UNREACHABLE);
  expect(bad.connected).toBe(false);
});

test('çok büyük istek gönderilmeden reddedilir', async () => {
  const client = new NativeClient({ connect });
  await expect(client.request({ op: 'exec', sql: 'x'.repeat(MAX_REQUEST_BYTES + 1) })).rejects.toThrow('çok büyük');
  expect(ports).toHaveLength(0);
});

test('executor: blob parametreleri kodlanır, satırlar çözülür, batch iletilir', async () => {
  const client = new NativeClient({ connect });
  const ex = createNativeExecutor(client);
  const q = ex.query<{ b: Uint8Array; n: number }>('SELECT ?', [new Uint8Array([1, 2])]);
  const p = ports[0];
  expect(p.sent[0]).toMatchObject({ op: 'query', params: [{ blob: 'AQI=' }] });
  p.reply({ id: p.sent[0].id, ok: true, rows: [{ b: { blob: 'AQI=' }, n: 3 }] });
  const rows = await q;
  expect(Array.from(rows[0].b)).toEqual([1, 2]);
  expect(rows[0].n).toBe(3);
  const batch = ex.batch([{ sql: 'DELETE FROM notes' }, { sql: 'INSERT INTO t VALUES (?)', params: ['ç'] }]);
  expect(p.sent[1]).toMatchObject({ op: 'batch', statements: [{ sql: 'DELETE FROM notes' }, { sql: 'INSERT INTO t VALUES (?)', params: ['ç'] }] });
  p.reply({ id: p.sent[1].id, ok: true });
  await batch;
  const ping = ex.ping();
  p.reply({ id: p.sent[2].id, ok: true, app: 'LifeTools', version: '0.4.0', desktopSchema: 4 });
  expect(await ping).toEqual({ app: 'LifeTools', version: '0.4.0', desktopSchema: 4 });
});

test('executorTransport hataları DbResponse olarak döndürür', async () => {
  const client = new NativeClient({ connect: () => { throw new Error('x'); } });
  const transport = executorTransport(createNativeExecutor(client));
  expect(await transport({ op: 'query', sql: 'SELECT 1' })).toEqual({ ok: false, error: DESKTOP_UNREACHABLE });
});
