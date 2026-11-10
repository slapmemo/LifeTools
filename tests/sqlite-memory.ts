import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { Executor } from '../src/db/migrations';

// Paketin ana girişi (index.mjs) `self` kullandığı için Node'da yüklenemez;
// Node'a özgü derlemeyi (sqlite3-node.mjs) doğrudan yüklüyoruz.
const NODE_BUILD = pathToFileURL(
  resolve('node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-node.mjs')
).href;

/** Node içinde gerçek (bellek içi) SQLite üzerinde çalışan Executor adaptörü. */
export async function createMemoryExecutor(): Promise<Executor> {
  const mod: any = await import(/* @vite-ignore */ NODE_BUILD);
  const sqlite3: any = await mod.default({ print: () => {}, printErr: () => {} });
  const db = new sqlite3.oo1.DB(':memory:', 'c');
  db.exec({ sql: 'PRAGMA foreign_keys=ON' });
  return {
    async exec(sql, params) {
      db.exec({ sql, bind: params && params.length > 0 ? params : undefined });
    },
    async batch(statements, opts) {
      const nested = sqlite3.capi.sqlite3_get_autocommit(db.pointer) === 0;
      if (opts?.requireTransaction && !nested) throw new Error('İşlem bağlamı kayboldu');
      db.exec({ sql: nested ? 'SAVEPOINT lt_batch' : 'BEGIN IMMEDIATE' });
      try {
        for (const { sql, params } of statements) db.exec({ sql, bind: params?.length ? params : undefined });
        db.exec({ sql: nested ? 'RELEASE lt_batch' : 'COMMIT' });
      } catch (err) {
        try { db.exec({ sql: nested ? 'ROLLBACK TO lt_batch; RELEASE lt_batch' : 'ROLLBACK' }); } catch { /* İşlem bitmiş olabilir. */ }
        throw err;
      }
    },
    async query<T>(sql: string, params?: any[]) {
      return db.exec({
        sql,
        bind: params && params.length > 0 ? params : undefined,
        rowMode: 'object',
        returnValue: 'resultRows'
      }) as T[];
    }
  };
}
