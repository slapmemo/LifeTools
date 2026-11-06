export type SqlParam = string | number | null | Uint8Array;

export type DbRequest =
  | { op: 'exec'; sql: string; params?: SqlParam[] }
  | { op: 'query'; sql: string; params?: SqlParam[] }
  | { op: 'version' };

export type DbResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Popup/diğer sayfalar -> service worker. */
export const BG_CHANNEL = 'lifetools-db-bg';
/** Service worker -> offscreen belge. */
export const OFFSCREEN_CHANNEL = 'lifetools-db-offscreen';

export interface DbApi {
  exec(sql: string, params?: SqlParam[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  schemaVersion(): Promise<number>;
}
