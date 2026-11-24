import { BACKUP_TABLES, exportData, restoreData } from '../core/backup';
import { asRemoteBackup } from './client';
import { runMigrations, type Executor } from './migrations';

/** Kaynak, köprünün 1 MB yanıt sınırına takılmasın diye küçük sayfalarla okunur. */
const PAGE_SIZE = 50;

/** Hedefte zaten eklenti verisi var ve üzerine yazma onayı verilmedi. */
export class TargetNotEmptyError extends Error {
  readonly counts: Record<string, number>;
  readonly total: number;
  constructor(counts: Record<string, number>) {
    super('Hedefte zaten veri var; üzerine yazmak için onay gerekli');
    this.name = 'TargetNotEmptyError';
    this.counts = counts;
    this.total = Object.values(counts).reduce((a, b) => a + b, 0);
  }
}

export async function countRows(ex: Executor): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    // Boş veritabanında bile tohumlanan dört yerleşik kategori "veri" sayılmaz; yalnız kullanıcı kategorileri.
    const where = table === 'note_categories' ? ' WHERE builtin = 0' : '';
    const rows = await ex.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}${where}`);
    out[table] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

/**
 * Eklenti tablolarını `source` -> `target` kopyalar (kaynak değişmez).
 * Sıra: hedefte migrasyonlar, kaynağı oku, dolu hedefi onaysız reddet, tek işlemde yaz, satır sayılarını doğrula.
 * Dönüş: hedefteki satır sayıları.
 */
export async function transferData(source: Executor, target: Executor, overwrite = false): Promise<Record<string, number>> {
  await runMigrations(target);
  // Sayfadan gelen istemciler için dışa/içe aktarma arka planda, DB kilidi altında yapılır.
  const sourceOps = asRemoteBackup(source);
  const targetOps = asRemoteBackup(target);
  const backup = sourceOps ? await sourceOps.exportBackup({}, PAGE_SIZE) : await exportData(source, {}, PAGE_SIZE);
  const existing = await countRows(target);
  if (!overwrite && Object.values(existing).some(n => n > 0)) throw new TargetNotEmptyError(existing);
  if (targetOps) await targetOps.restoreBackup(backup);
  else await restoreData(target, backup);
  const after = await countRows(target);
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table as keyof typeof backup.tables];
    const expected = table === 'note_categories' ? rows.filter(row => Number(row.builtin ?? 0) === 0).length : rows.length;
    if (after[table] !== expected) throw new Error(`Aktarım doğrulanamadı: ${table} (beklenen ${expected}, hedefte ${after[table]})`);
  }
  return after;
}
