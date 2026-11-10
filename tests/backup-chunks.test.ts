import { describe, expect, it, vi } from 'vitest';
import { BACKUP_TABLES, chunkStatements, restoreData, type Backup } from '../src/core/backup';
import type { Executor } from '../src/db/migrations';

describe('chunkStatements', () => {
  it('preserves order and produces nonempty bounded UTF-8 chunks', () => {
    const statements = ['ö', 'iki', 'üç'].map(value => ({ sql: 'INSERT INTO notes VALUES (?)', params: [value] }));
    const maxBytes = new TextEncoder().encode(JSON.stringify([statements[0], statements[1]])).length;
    const chunks = chunkStatements(statements, maxBytes);
    expect(chunks.flat()).toEqual(statements);
    expect(chunks.every(chunk => chunk.length > 0 && new TextEncoder().encode(JSON.stringify(chunk)).length <= maxBytes)).toBe(true);
    expect(chunkStatements([], maxBytes)).toEqual([]);
  });

  it('identifies an oversized statement table', () => {
    expect(() => chunkStatements([{ sql: 'INSERT INTO note_images VALUES (?)', params: ['x'.repeat(100)] }], 20)).toThrow(/note_images/);
  });
});

describe('restoreData', () => {
  it('rolls back the first chunk when the second chunk fails', async () => {
    let rows = ['original'];
    let snapshot: string[] = [];
    let batches = 0;
    const ex: Executor = {
      async exec(sql) {
        if (sql === 'BEGIN IMMEDIATE') snapshot = [...rows];
        if (sql === 'ROLLBACK') rows = snapshot;
      },
      async batch(statements) {
        if (++batches === 2) throw new Error('injected failure');
        for (const statement of statements) {
          if (statement.sql === 'DELETE FROM notes') rows = [];
          if (statement.sql.startsWith('INSERT INTO notes')) rows.push(String(statement.params?.[0]));
        }
      },
      async query<T>(): Promise<T[]> { return []; }
    };
    const tables = Object.fromEntries(BACKUP_TABLES.map(name => [name, []])) as unknown as Backup['tables'];
    tables.notes = [{ id: 'a', text: 'x'.repeat(1_300_000) }, { id: 'b', text: 'y'.repeat(1_300_000) }];
    const backup: Backup = { app: 'LifeTools', format: 1, schema_version: 9, exported_at: new Date().toISOString(), tables, settings: {} };
    await expect(restoreData(ex, backup)).rejects.toThrow('Geri yükleme yapılamadı, mevcut verilere dokunulmadı: injected failure');
    expect(batches).toBe(2);
    expect(rows).toEqual(['original']);
  });
});

/** İşlem takibi yapan, bellek içi sahte DB: tek tablo (notes). */
function fakeDb() {
  const state = { rows: ['original'], snapshot: null as string[] | null, log: [] as string[] };
  const ex: Executor = {
    async exec(sql) {
      state.log.push(sql);
      if (sql.startsWith('BEGIN')) { if (state.snapshot) throw new Error('cannot start a transaction within a transaction'); state.snapshot = [...state.rows]; }
      else if (sql === 'COMMIT') state.snapshot = null;
      else if (sql === 'ROLLBACK') { if (state.snapshot) state.rows = state.snapshot; state.snapshot = null; }
    },
    async batch(statements, opts) {
      if (opts?.requireTransaction && !state.snapshot) throw new Error('İşlem bağlamı kayboldu');
      for (const s of statements) {
        if (s.sql === 'DELETE FROM notes') state.rows = [];
        if (s.sql.startsWith('INSERT INTO notes')) state.rows.push(String(s.params?.[0]));
      }
    },
    async query<T>(): Promise<T[]> { return []; }
  };
  return { state, ex };
}

function bigBackup(): Backup {
  const tables = Object.fromEntries(BACKUP_TABLES.map(name => [name, []])) as unknown as Backup['tables'];
  tables.notes = [{ id: 'a', text: 'x'.repeat(1_300_000) }, { id: 'b', text: 'y'.repeat(1_300_000) }];
  return { app: 'LifeTools', format: 1, schema_version: 9, exported_at: new Date().toISOString(), tables, settings: {} };
}

describe('restoreData atomicity', () => {
  it('commits nothing when the transaction context is lost between calls', async () => {
    const { state, ex } = fakeDb();
    let calls = 0;
    const reconnecting: Executor = {
      ...ex,
      async batch(statements, opts) {
        if (++calls === 2) { state.rows = state.snapshot ?? state.rows; state.snapshot = null; } // yeniden bağlanma: eski bağlantının işlemi düşer, yeni bağlantı autocommit
        return ex.batch(statements, opts);
      }
    };
    await expect(restoreData(reconnecting, bigBackup())).rejects.toThrow(/İşlem bağlamı kayboldu/);
    expect(calls).toBe(2);
    expect(state.rows).toEqual(['original']);
  });

  it('does not roll back a foreign transaction when BEGIN fails', async () => {
    const { state, ex } = fakeDb();
    state.snapshot = [...state.rows];
    await expect(restoreData(ex, bigBackup())).rejects.toThrow(/başlatılamadı/);
    expect(state.log).not.toContain('ROLLBACK');
    expect(state.snapshot).not.toBeNull();
  });
});

describe('withExclusiveDb', () => {
  it('serializes a concurrent write after the restore finishes', async () => {
    const { state, ex } = fakeDb();
    const { executorTransport } = await import('../src/db/native');
    const transport = executorTransport(ex);
    vi.stubGlobal('chrome', {
      runtime: {
        getContexts: async () => [{}],
        sendMessage: async (m: { req: Parameters<typeof transport>[0] }) => {
          await new Promise(r => setTimeout(r, 1));
          return transport(m.req);
        }
      }
    });
    try {
      const { dbRequest, restoreBackground } = await import('../src/db/host');
      const restore = restoreBackground(bigBackup(), 'browser');
      const write = dbRequest({ op: 'exec', sql: 'INSERT INTO notes (x) VALUES (1)' }, 'browser');
      await Promise.all([restore, write]);
      const commit = state.log.indexOf('COMMIT');
      const insert = state.log.indexOf('INSERT INTO notes (x) VALUES (1)');
      expect(commit).toBeGreaterThan(-1);
      expect(insert).toBeGreaterThan(commit);
      expect(state.rows).toEqual(['a', 'b']);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
