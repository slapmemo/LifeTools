import { MIGRATIONS, readVersion, type Executor } from '../db/migrations';
import type { SqlParam, SqlStatement } from '../db/protocol';
const columns = { notes: ['id','category','text','url','page_title','user_note','created_at','updated_at'], snippets: ['id','trigger','title','body','use_count','created_at','updated_at'], tasks: ['id','title','note','url','due_date','done_at','created_at','updated_at'], site_time: ['day','domain','seconds'], sessions: ['id','name','created_at'], session_tabs: ['id','session_id','position','url','title','pinned','group_title','group_color'], tab_labels: ['url','label','updated_at'], tab_notes: ['url','note','created_at','updated_at'], watch_items: ['id','title','kind','status','url','note','created_at','updated_at'] } as const;
type Table = keyof typeof columns;
type Row = Record<string, SqlParam>;
export interface Backup { app: 'LifeTools'; format: 1; schema_version: number; exported_at: string; tables: Record<Table, Row[]>; settings: Record<string, unknown> }
const names = Object.keys(columns) as Table[];
const introduced: Record<Table, number> = { notes: 2, snippets: 3, tasks: 4, site_time: 5, sessions: 6, session_tabs: 6, tab_labels: 7, tab_notes: 7, watch_items: 8 };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export async function exportData(ex: Executor, settings: Record<string, unknown>): Promise<Backup> {
  const tables = {} as Backup['tables'];
  for (const name of names) tables[name] = await ex.query<Row>(`SELECT * FROM ${name}`);
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
export async function restoreData(ex: Executor, backup: Backup): Promise<Record<Table, number>> {
  // Silme ters sırada (alt tablolar önce), ekleme sırayla (sessions, session_tabs'tan önce) yapılır.
  const statements: SqlStatement[] = [...names].reverse().map(name => ({ sql: `DELETE FROM ${name}` }));
  for (const name of names) for (const row of backup.tables[name]) {
    const keys = columns[name].filter(key => Object.prototype.hasOwnProperty.call(row, key));
    if (!keys.length) throw new Error(`Geçersiz satır: ${name}`);
    statements.push({ sql: `INSERT INTO ${name} (${keys.map(key => `"${key}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, params: keys.map(key => row[key]) });
  }
  await ex.batch(statements);
  return Object.fromEntries(names.map(name => [name, backup.tables[name].length])) as Record<Table, number>;
}
