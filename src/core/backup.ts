import { MIGRATIONS, readVersion, type Executor } from '../db/migrations';
import type { SqlParam, SqlStatement } from '../db/protocol';
const columns = { notes: ['id','category','text','url','page_title','user_note','created_at','updated_at'], snippets: ['id','trigger','title','body','use_count','created_at','updated_at'], tasks: ['id','title','note','url','due_date','done_at','created_at','updated_at'], site_time: ['day','domain','seconds'], sessions: ['id','name','created_at'], session_tabs: ['id','session_id','position','url','title','pinned','group_title','group_color'], tab_labels: ['url','label','updated_at'], tab_notes: ['url','note','created_at','updated_at'], watch_items: ['id','title','kind','status','url','note','created_at','updated_at'], note_pages: ['note_id','text','saved_at'], note_images: ['note_id','data_url','width','height'] } as const;
type Table = keyof typeof columns;
type Row = Record<string, SqlParam>;
export interface Backup { app: 'LifeTools'; format: 1; schema_version: number; exported_at: string; tables: Record<Table, Row[]>; settings: Record<string, unknown> }
const names = Object.keys(columns) as Table[];
const introduced: Record<Table, number> = { notes: 2, snippets: 3, tasks: 4, site_time: 5, sessions: 6, session_tabs: 6, tab_labels: 7, tab_notes: 7, watch_items: 8, note_pages: 9, note_images: 9 };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const BACKUP_TABLES: readonly string[] = names;
async function readPaged(ex: Executor, name: Table, size: number): Promise<Row[]> {
  const out: Row[] = [];
  for (;;) {
    let page: Row[];
    try {
      page = await ex.query<Row>(`SELECT * FROM ${name} ORDER BY rowid LIMIT ${size} OFFSET ${out.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (size <= 1 || !/(1\s*MB|too large|çok büyük|boyut.*sınır)/i.test(message)) throw err;
      size = Math.max(1, Math.floor(size / 2));
      continue;
    }
    out.push(...page);
    if (page.length < size) return out;
  }
}
/** `pageSize > 0`: tabloları sayfa sayfa okur (masaüstü köprüsünün 1 MB yanıt sınırı için). */
export async function exportData(ex: Executor, settings: Record<string, unknown>, pageSize = 0): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const name of names) {
    const limit = name === 'note_images' ? 1 : name === 'note_pages' ? 5 : name === 'notes' || name === 'snippets' ? 20 : pageSize;
    tables[name] = limit > 0 ? await readPaged(ex, name, pageSize > 0 ? Math.min(limit, pageSize) : limit) : await ex.query<Row>(`SELECT * FROM ${name}`);
  }
  return { app: 'LifeTools', format: 1, schema_version: await readVersion(ex), exported_at: new Date().toISOString(), tables, settings };
}
export function validateBackup(json: unknown): Backup {
  if (!object(json) || json.app !== 'LifeTools' || json.format !== 1) throw new Error('Geçersiz LifeTools yedeği veya yedek biçimi');
  if (!Number.isInteger(json.schema_version) || (json.schema_version as number) < 0) throw new Error('Geçersiz şema sürümü');
  const version = json.schema_version as number;
  if (version > Math.max(...MIGRATIONS.map(m => m.version))) throw new Error('Bu yedek daha yeni bir LifeTools sürümünden');
  if (!object(json.tables) || !object(json.settings) || typeof json.exported_at !== 'string' || Number.isNaN(Date.parse(json.exported_at))) throw new Error('Yedek verileri eksik veya geçersiz');
  const tables = {} as Backup['tables'];
  for (const name of names) {
    const rows = json.tables[name];
    if (rows === undefined && version < introduced[name]) { tables[name] = []; continue; }
    if (!Array.isArray(rows) || !rows.every(row => object(row) && columns[name].every(key => !(key in row) || row[key] === null || typeof row[key] === 'string' || (typeof row[key] === 'number' && Number.isFinite(row[key]))))) throw new Error(`Geçersiz veya eksik tablo: ${name}`);
    tables[name] = rows as Row[];
  }
  return { app: 'LifeTools', format: 1, schema_version: version, exported_at: json.exported_at, tables, settings: json.settings };
}
/** JSON UTF-8 boyutuna göre sıralamayı koruyarak boş olmayan gruplar oluşturur. */
export function chunkStatements(statements: SqlStatement[], maxBytes: number): SqlStatement[][] {
  const chunks: SqlStatement[][] = [];
  let chunk: SqlStatement[] = [];
  let bytes = 2;
  const encoder = new TextEncoder();
  for (const statement of statements) {
    const size = encoder.encode(JSON.stringify(statement)).length;
    if (size + 2 > maxBytes) {
      const table = /(?:INTO|FROM)\s+["`\[]?([\w]+)/i.exec(statement.sql)?.[1] ?? 'bilinmeyen';
      throw new Error(`Tablo için tek bir kayıt çok büyük: ${table}`);
    }
    if (bytes + size + (chunk.length ? 1 : 0) > maxBytes) {
      chunks.push(chunk);
      chunk = [];
      bytes = 2;
    }
    bytes += size + (chunk.length ? 1 : 0);
    chunk.push(statement);
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
export async function restoreData(ex: Executor, backup: Backup): Promise<Record<Table, number>> {
  // Silme ters sırada (alt tablolar önce), ekleme sırayla (sessions, session_tabs'tan önce) yapılır.
  const statements: SqlStatement[] = [...names].reverse().map(name => ({ sql: `DELETE FROM ${name}` }));
  for (const name of names) for (const row of backup.tables[name]) {
    const keys = columns[name].filter(key => Object.prototype.hasOwnProperty.call(row, key));
    if (!keys.length) throw new Error(`Geçersiz satır: ${name}`);
    statements.push({ sql: `INSERT INTO ${name} (${keys.map(key => `"${key}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, params: keys.map(key => row[key]) });
  }
  const chunks = chunkStatements(statements, 2_500_000);
  // BEGIN başarısız olursa (başka bir işlem açık) başkasının işlemini geri almamak için try dışında.
  try {
    await ex.exec('BEGIN IMMEDIATE');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Geri yükleme başlatılamadı, mevcut verilere dokunulmadı: ${message}`);
  }
  try {
    for (const chunk of chunks) await ex.batch(chunk, { requireTransaction: true });
    await ex.exec('COMMIT');
  } catch (err) {
    try { await ex.exec('ROLLBACK'); } catch { /* İşlem başlamamış veya bitmiş olabilir. */ }
    const message = err instanceof Error ? err.message : String(err);
    const update = /within a transaction|cannot start a transaction/i.test(message)
      ? ' Masaüstü uygulamasını güncellemeniz gerekebilir.' : '';
    throw new Error(`Geri yükleme yapılamadı, mevcut verilere dokunulmadı: ${message}${update}`);
  }
  return Object.fromEntries(names.map(name => [name, backup.tables[name].length])) as Record<Table, number>;
}
