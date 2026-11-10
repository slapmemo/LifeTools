import type { Executor } from './migrations';
import { readVersion } from './migrations';
import type { DbRequest, DbResponse, SqlParam } from './protocol';

// Bu dosya chrome.* kullanmaz; port enjekte edilir (testlerde sahte port).

export const NATIVE_HOST_NAME = 'com.mehmet.lifetools';
export const DESKTOP_UNREACHABLE = 'Masaüstü uygulamasına ulaşılamıyor';
export const REQUEST_TIMEOUT_MS = 10_000;
/** Masaüstü ana bilgisayarı 4 MB üstünü reddeder; payı bırakıyoruz. */
export const MAX_REQUEST_BYTES = 3_500_000;

export interface PortLike {
  postMessage(message: unknown): void;
  onMessage: { addListener(cb: (message: any) => void): void };
  onDisconnect: { addListener(cb: () => void): void };
  disconnect(): void;
}

export interface NativeClientOptions {
  connect: () => PortLike;
  timeoutMs?: number;
  /** Port koptuğunda (bekleyen istekler reddedildikten sonra) çağrılır. */
  onDisconnect?: () => void;
}

export interface NativeResponse {
  id?: number;
  ok: boolean;
  error?: string;
  rows?: unknown[];
  [key: string]: unknown;
}

export interface PingInfo { app: string; version: string; desktopSchema: number; extensionDir?: string; extensionVersion?: string | null }

interface Pending {
  resolve: (res: NativeResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class NativeClient {
  private port: PortLike | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly opts: NativeClientOptions;

  constructor(opts: NativeClientOptions) {
    this.opts = opts;
  }

  get connected(): boolean {
    return this.port !== null;
  }

  private ensurePort(): PortLike {
    if (this.port) return this.port;
    const port = this.opts.connect();
    port.onMessage.addListener(message => this.handleMessage(message));
    port.onDisconnect.addListener(() => this.handleDisconnect(port));
    this.port = port;
    return port;
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== 'object' || message === null) return;
    const res = message as NativeResponse;
    if (typeof res.id !== 'number') return;
    const entry = this.pending.get(res.id);
    if (!entry) return;
    this.pending.delete(res.id);
    clearTimeout(entry.timer);
    if (res.ok) entry.resolve(res);
    else entry.reject(new Error(typeof res.error === 'string' ? res.error : 'Masaüstü uygulaması bilinmeyen bir hata verdi'));
  }

  private handleDisconnect(port: PortLike): void {
    if (this.port === port) this.port = null;
    this.failAll(new Error(DESKTOP_UNREACHABLE));
    this.opts.onDisconnect?.();
  }

  private failAll(err: Error): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
  }

  /** İstek gövdesine bir `id` ekler ve eşleşen yanıtı bekler. Kopma sonrası ilk istekte yeniden bağlanır. */
  request(body: Record<string, unknown>): Promise<NativeResponse> {
    return new Promise<NativeResponse>((resolve, reject) => {
      const id = ++this.seq;
      const message = { id, ...body };
      if (new TextEncoder().encode(JSON.stringify(message)).length > MAX_REQUEST_BYTES) {
        reject(new Error('Veri masaüstü köprüsü için çok büyük (en fazla ~3,5 MB)'));
        return;
      }
      let port: PortLike;
      try {
        port = this.ensurePort();
      } catch {
        reject(new Error(DESKTOP_UNREACHABLE));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Masaüstü uygulaması yanıt vermedi (zaman aşımı)'));
      }, this.opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        port.postMessage(message);
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        if (this.port === port) this.port = null;
        reject(new Error(DESKTOP_UNREACHABLE));
      }
    });
  }

  close(): void {
    const port = this.port;
    this.port = null;
    this.failAll(new Error(DESKTOP_UNREACHABLE));
    try { port?.disconnect(); } catch { /* zaten kopmuş olabilir */ }
  }
}

// ---------- Parametre/satır kodlaması (blob = { blob: base64 }) ----------

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeParam(param: SqlParam): unknown {
  return param instanceof Uint8Array ? { blob: toBase64(param) } : param;
}

export function decodeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const blob = typeof value === 'object' && value !== null ? (value as { blob?: unknown }).blob : undefined;
    out[key] = typeof blob === 'string' && Object.keys(value as object).length === 1 ? fromBase64(blob) : value;
  }
  return out;
}

export type NativeExecutor = Executor & { ping(): Promise<PingInfo> };

export function createNativeExecutor(client: NativeClient): NativeExecutor {
  return {
    async exec(sql, params) {
      await client.request({ op: 'exec', sql, params: params?.map(encodeParam) });
    },
    async query<T>(sql: string, params?: SqlParam[]) {
      const res = await client.request({ op: 'query', sql, params: params?.map(encodeParam) });
      return (res.rows ?? []).map(row => decodeRow(row as Record<string, unknown>)) as T[];
    },
    async batch(statements) {
      await client.request({
        op: 'batch',
        statements: statements.map(s => ({ sql: s.sql, params: s.params?.map(encodeParam) }))
      });
    },
    async ping() {
      const res = await client.request({ op: 'ping' });
      if (res.app !== 'LifeTools') throw new Error('Beklenmeyen masaüstü yanıtı');
      return { app: String(res.app), version: String(res.version), desktopSchema: Number(res.desktopSchema) };
    }
  };
}

/** DbRequest'i bir Executor üzerinden çalıştırır (ping hariç: o üst katmanda ele alınır). */
export function executorTransport(ex: Executor): (req: DbRequest) => Promise<DbResponse> {
  return async req => {
    try {
      switch (req.op) {
        case 'exec':
          await ex.exec(req.sql, req.params);
          return { ok: true, data: null };
        case 'query':
          return { ok: true, data: await ex.query(req.sql, req.params) };
        case 'batch':
          await ex.batch(req.statements);
          return { ok: true, data: null };
        case 'version':
          return { ok: true, data: await readVersion(ex) };
        default:
          return { ok: false, error: 'Bilinmeyen işlem' };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };
}
