export type SqlParam = string | number | null | Uint8Array;

export interface SqlStatement { sql: string; params?: SqlParam[] }

export type DbRequest =
  | { op: 'exec'; sql: string; params?: SqlParam[] }
  | { op: 'query'; sql: string; params?: SqlParam[] }
  /** `requireTransaction`: açık işlem yoksa hiçbir ifade çalıştırılmadan hata döner. */
  | { op: 'batch'; statements: SqlStatement[]; requireTransaction?: boolean }
  | { op: 'version' }
  /** Her zaman masaüstü köprüsüne gider (depolama arka ucundan bağımsız). */
  | { op: 'ping' };

export interface BatchOptions { requireTransaction?: boolean }

export const TRANSACTION_LOST = 'İşlem bağlamı kayboldu';

export type DbResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Popup/diğer sayfalar -> service worker. */
export const BG_CHANNEL = 'lifetools-db-bg';
/** Service worker -> offscreen belge. */
export const OFFSCREEN_CHANNEL = 'lifetools-db-offscreen';

export interface DbApi {
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  batch(statements: SqlStatement[], opts?: BatchOptions): Promise<void>;
  schemaVersion(): Promise<number>;
}
