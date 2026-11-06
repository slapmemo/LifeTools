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
    schemaVersion() {
      return call<number>({ op: 'version' });
    }
  };
}

/** Popup gibi sayfalar için: istek service worker üzerinden offscreen belgeye gider. */
export const popupDb: DbApi = createDbClient(
  req => chrome.runtime.sendMessage({ channel: BG_CHANNEL, req }) as Promise<DbResponse>
);
