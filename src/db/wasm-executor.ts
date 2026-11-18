import type { Executor } from './migrations';
import type { SqlParam } from './protocol';
import { TRANSACTION_LOST } from './protocol';

export interface WasmDb {
  exec(opts: Record<string, unknown>): unknown;
  pointer: number;
}

/**
 * sqlite-wasm `oo1.DB` üzerinde Executor. Eklentinin DB worker'ı ve testler aynı kodu kullanır
 * (testler Node derlemesiyle, bellek içi DB ile).
 */
export function createWasmExecutor(sqlite3: { capi: { sqlite3_get_autocommit(pointer: number): number } }, db: WasmDb): Executor {
  return {
    async exec(sql: string, params?: SqlParam[]) {
      db.exec({ sql, bind: params && params.length > 0 ? params : undefined });
    },
    async batch(statements, opts) {
      const nested = sqlite3.capi.sqlite3_get_autocommit(db.pointer) === 0;
      if (opts?.requireTransaction && !nested) throw new Error(TRANSACTION_LOST);
      db.exec({ sql: nested ? 'SAVEPOINT lt_batch' : 'BEGIN IMMEDIATE' });
      try {
        for (const { sql, params } of statements) db.exec({ sql, bind: params?.length ? params : undefined });
        db.exec({ sql: nested ? 'RELEASE lt_batch' : 'COMMIT' });
      } catch (err) {
        try { db.exec({ sql: nested ? 'ROLLBACK TO lt_batch; RELEASE lt_batch' : 'ROLLBACK' }); } catch { /* işlem bitmiş olabilir */ }
        throw err;
      }
    },
    async query<T>(sql: string, params?: SqlParam[]) {
      return db.exec({
        sql,
        bind: params && params.length > 0 ? params : undefined,
        rowMode: 'object',
        returnValue: 'resultRows'
      }) as T[];
    }
  };
}
