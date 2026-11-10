import type { Backup } from '../core/backup';
import type { DbBackend } from './backend';
import type { PingInfo } from './native';
import { DESKTOP_UNREACHABLE } from './native';
import type { DbApi, DbRequest, DbResponse, SqlParam } from './protocol';
import { BG_CHANNEL } from './protocol';

export type Transport = (req: DbRequest) => Promise<DbResponse>;

/** Taşıyıcıdan bağımsız, tipli DB API'si. */
export function createDbClient(transport: Transport): DbApi {
  async function call<T>(req: DbRequest): Promise<T> {
    const res = await transport(req);
    if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : 'Veritabanı yanıt vermedi');
    return res.data as T;
  }
  return {
    async exec(sql: string, params?: SqlParam[]) {
      await call<null>({ op: 'exec', sql, params });
    },
    query<T = Record<string, unknown>>(sql: string, params?: SqlParam[]) {
      return call<T[]>({ op: 'query', sql, params });
    },
    async batch(statements, opts) {
      await call<null>(opts?.requireTransaction ? { op: 'batch', statements, requireTransaction: true } : { op: 'batch', statements });
    },
    schemaVersion() {
      return call<number>({ op: 'version' });
    }
  };
}

/**
 * Popup gibi sayfalar için: istek service worker üzerinden gider.
 * `backend` verilirse ayardaki arka uç yerine o kullanılır (taşıma için).
 */
export function popupDbFor(backend?: DbBackend): DbApi & RemoteBackup {
  const api = createDbClient(
    req => chrome.runtime.sendMessage({ channel: BG_CHANNEL, req, backend }) as Promise<DbResponse>
  );
  return Object.assign(api, {
    async exportBackup(settings: Record<string, unknown>, pageSize: number): Promise<Backup> {
      return unwrap(await chrome.runtime.sendMessage({ type: 'backup:export', settings, pageSize, backend }) as DbResponse<Backup> | undefined);
    },
    async restoreBackup(backup: Backup): Promise<Record<string, number>> {
      return unwrap(await chrome.runtime.sendMessage({ type: 'backup:restore', backup, backend }) as DbResponse<Record<string, number>> | undefined);
    }
  });
}

function unwrap<T>(res: DbResponse<T> | undefined): T {
  if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : 'Arka plan yanıt vermedi');
  return res.data;
}

/** Yedek dışa/içe aktarma, tek işlemde ve DB kilidi altında arka planda çalışır. */
export interface RemoteBackup {
  exportBackup(settings: Record<string, unknown>, pageSize: number): Promise<Backup>;
  restoreBackup(backup: Backup): Promise<Record<string, number>>;
}

export function asRemoteBackup(ex: unknown): RemoteBackup | null {
  const r = ex as Partial<RemoteBackup> | null;
  return r && typeof r.exportBackup === 'function' && typeof r.restoreBackup === 'function' ? (r as RemoteBackup) : null;
}

/** Ayardaki (db_backend) arka uca bağlı API. */
export const popupDb: DbApi & RemoteBackup = popupDbFor();

/** Masaüstü köprüsünü yoklar; ulaşılamazsa Türkçe hata fırlatır. */
export async function pingDesktop(): Promise<PingInfo> {
  const res = (await chrome.runtime.sendMessage({ channel: BG_CHANNEL, req: { op: 'ping' } })) as
    | DbResponse<PingInfo>
    | undefined;
  if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : DESKTOP_UNREACHABLE);
  return res.data;
}
