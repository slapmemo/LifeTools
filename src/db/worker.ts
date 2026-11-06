import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Executor } from './migrations';
import { readVersion, runMigrations } from './migrations';
import type { DbRequest, DbResponse, SqlParam } from './protocol';

// Bu dosya dedicated Worker olarak çalışır (offscreen belge tarafından başlatılır).
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<{ id: number; req: DbRequest }>) => void) | null;
};

interface WasmDb {
  exec(opts: Record<string, unknown>): unknown;
}

const DB_PATH = '/lifetools.db';

async function init(): Promise<Executor> {
  const sqlite3 = await sqlite3InitModule({
    // sqlite3.wasm, bu worker dosyasının yanında (dist/) bulunur.
    locateFile: (file: string) => new URL(file, import.meta.url).href
  } as never);

  const poolUtil = await (sqlite3 as any).installOpfsSAHPoolVfs({ directory: '.lifetools-sqlite' });
  const db = new poolUtil.OpfsSAHPoolDb(DB_PATH) as WasmDb;

  const executor: Executor = {
    async exec(sql: string, params?: SqlParam[]) {
      db.exec({ sql, bind: params && params.length > 0 ? params : undefined });
    },
    async batch(statements) {
      db.exec({ sql: 'BEGIN IMMEDIATE' });
      try {
        for (const { sql, params } of statements) db.exec({ sql, bind: params?.length ? params : undefined });
        db.exec({ sql: 'COMMIT' });
      } catch (err) {
        try { db.exec({ sql: 'ROLLBACK' }); } catch { /* i?lem bitmi? olabilir */ }
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

  await runMigrations(executor);
  return executor;
}

const ready: Promise<Executor> = init();

async function handle(req: DbRequest): Promise<DbResponse> {
  try {
    const ex = await ready;
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
}

ctx.onmessage = event => {
  const { id, req } = event.data;
  void handle(req).then(res => ctx.postMessage({ id, res }));
};
