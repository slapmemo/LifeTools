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
    async batch(statements) {
      await call<null>({ op: 'batch', statements });
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
export function popupDbFor(backend?: DbBackend): DbApi {
  return createDbClient(
    req => chrome.runtime.sendMessage({ channel: BG_CHANNEL, req, backend }) as Promise<DbResponse>
  );
}

/** Ayardaki (db_backend) arka uca bağlı API. */
export const popupDb: DbApi = popupDbFor();

/** Masaüstü köprüsünü yoklar; ulaşılamazsa Türkçe hata fırlatır. */
export async function pingDesktop(): Promise<PingInfo> {
  const res = (await chrome.runtime.sendMessage({ channel: BG_CHANNEL, req: { op: 'ping' } })) as
    | DbResponse<PingInfo>
    | undefined;
  if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : DESKTOP_UNREACHABLE);
  return res.data;
}
