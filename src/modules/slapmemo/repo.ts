import { NOTE_CATEGORY_SEED_SQL, type Executor } from '../../db/migrations';
import type { SqlParam, SqlStatement } from '../../db/protocol';
import { DEFAULT_CATEGORY, MAX_CATEGORY_LABEL, isNoteColor, slugifyCategoryId, type NoteCategory, type NoteCategoryRow } from './categories';

export interface Note {
  id: number;
  category: NoteCategory;
  text: string;
  url: string | null;
  page_title: string | null;
  user_note: string | null;
  created_at: number;
  updated_at: number;
  /** note_extra: renk adı (NOTE_COLORS) ya da null. */
  color?: string | null;
  /** note_extra: elle sıralama konumu (küçük önce) ya da null. */
  position?: number | null;
  /** Yalnız çöp listesinde dolu (ms). */
  deleted_at?: number | null;
}

export interface NewNote {
  category: NoteCategory;
  text: string;
  url?: string | null;
  pageTitle?: string | null;
  allowDuplicate?: boolean;
}

export interface AddResult {
  note: Note;
  /** Aynı url + aynı metin zaten kayıtlıysa true; yeni satır eklenmez. */
  duplicate: boolean;
}

export interface ListOptions {
  category?: NoteCategory | null;
  limit?: number;
  offset?: number;
  /** 'new' (varsayılan), 'manual' (elle sıra; sabitlenenler yine önce). */
  sort?: 'new' | 'manual';
}

/** Not metni üst sınırı (karakter); masaüstüyle aynı. */
export const MAX_NOTE_TEXT = 50_000;
/** Çöpteki not bu kadar gün sonra kalıcı silinir. */
export const TRASH_DAYS = 15;
/** Bu süreden sık gelen kayıtlar geçmişe ayrıca yazılmaz. */
export const HISTORY_MERGE_MS = 5 * 60_000;
export const HISTORY_MAX_PER_NOTE = 30;
export const HISTORY_MAX_AGE_MS = 60 * 86_400_000;
const DAY_MS = 86_400_000;

export interface NoteHistoryRow {
  id: number;
  note_id: number;
  text: string;
  saved_at: number;
}

const SEARCH_LIMIT = 100;

/** Beklenen `updated_at` ile kayıttaki eşleşmedi: not başka yerde değişmiş (ya da silinmiş). */
export class NoteVersionConflict extends Error {
  constructor(message = 'Bu not başka yerde değişti') {
    super(message);
    this.name = 'NoteVersionConflict';
  }
}

export function normalizeNoteUrl(url: string): string {
  const withoutHash = url.split('#', 1)[0];
  const query = withoutHash.indexOf('?');
  const path = query < 0 ? withoutHash : withoutHash.slice(0, query);
  return path.replace(/\/$/, '') + (query < 0 ? '' : withoutHash.slice(query));
}

/** unicode61 Türkçe noktasız ı'yı i'ye indirgemez; hem dizinleme (SQL) hem sorgu tarafında yapılır. */
export function foldTurkish(input: string): string {
  return input.replace(/ı/g, 'i').replace(/İ/g, 'I');
}

/** Kullanıcı girdisini güvenli bir FTS5 sorgusuna çevirir (her sözcük önek eşleşmesi, hepsi gerekli). */
export function buildFtsQuery(input: string): string | null {
  const tokens = foldTurkish(input)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map(token => `"${token}"*`).join(' ');
}

const NOT_TRASHED = 'NOT EXISTS (SELECT 1 FROM note_extra x WHERE x.note_id = n.id AND x.deleted_at IS NOT NULL)';
const NOTE_SELECT = 'SELECT n.*, e.color AS color, e.position AS position FROM notes n LEFT JOIN note_extra e ON e.note_id = n.id';
/** note_extra satırını oluşturup tek alanı yazar; not yoksa hiçbir şey yapmaz. */
const upsertExtra = (field: 'deleted_at' | 'color' | 'position') =>
  `INSERT INTO note_extra (note_id, ${field}) SELECT ?, ? WHERE EXISTS (SELECT 1 FROM notes WHERE id = ?) ON CONFLICT(note_id) DO UPDATE SET ${field} = excluded.${field}`;

function checkText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Not metni boş olamaz');
  if (trimmed.length > MAX_NOTE_TEXT) throw new Error('Not en fazla 50 000 karakter olmalı');
  return trimmed;
}

/** `where`, note_extra üzerinde çöpteki (ve istenirse süresi dolmuş) notları seçen koşuldur. */
function purgeStatements(where: string, params: SqlParam[]): SqlStatement[] {
  const ids = `SELECT note_id FROM note_extra WHERE ${where}`;
  // note_extra en sonda, `notes` silinince ON DELETE CASCADE ile gider; alt sorgu o zamana kadar geçerli kalır.
  return [
    ...['note_images', 'note_pages', 'note_meta', 'note_history'].map(t => ({ sql: `DELETE FROM ${t} WHERE note_id IN (${ids})`, params })),
    { sql: `DELETE FROM notes WHERE id IN (${ids})`, params }
  ];
}

/** `order` kapsamın tam sırası, `ids` görünen satırların yeni sırası; `ids`'in kapladığı yuvalara yeni sırayla yerleştirir. */
export function reorderScope(order: number[], ids: number[]): number[] {
  const inScope = new Set(order);
  const wanted: number[] = [];
  for (const id of ids) if (inScope.has(id) && !wanted.includes(id)) wanted.push(id);
  const set = new Set(wanted);
  let next = 0;
  return order.map(id => (set.has(id) ? wanted[next++] : id));
}

export function createNotesRepo(ex: Executor, now: () => number = Date.now) {
  async function getById(id: number): Promise<Note | null> {
    const rows = await ex.query<Note>(`${NOTE_SELECT} WHERE n.id = ?`, [id]);
    return rows[0] ?? null;
  }

  async function categoryExists(id: string): Promise<boolean> {
    return (await ex.query('SELECT 1 FROM note_categories WHERE id = ?', [id])).length > 0;
  }

  async function requireCategory(id: string): Promise<void> {
    if (typeof id !== 'string' || !(await categoryExists(id))) throw new Error('Geçersiz kategori');
  }

  async function trashCount(): Promise<number> {
    return Number((await ex.query<{ n: number }>('SELECT count(*) AS n FROM note_extra WHERE deleted_at IS NOT NULL'))[0]?.n ?? 0);
  }

  async function purgeNote(id: number): Promise<void> {
    await ex.batch([
      ...['note_images', 'note_pages', 'note_meta', 'note_history', 'note_extra'].map(t => ({ sql: `DELETE FROM ${t} WHERE note_id = ?`, params: [id] })),
      { sql: 'DELETE FROM notes WHERE id = ?', params: [id] }
    ]);
  }

  /** Geçmişe yazma ifadeleri: 5 dakikadan sık gelenler atlanır (force: geri yüklemede her zaman yazılır). */
  async function historyStatements(id: number, nextText: string | null, force = false): Promise<SqlStatement[]> {
    const current = (await ex.query<{ text: string }>('SELECT text FROM notes WHERE id = ?', [id]))[0];
    if (!current || (nextText !== null && current.text === nextText)) return [];
    const ts = now();
    if (!force) {
      const last = (await ex.query<{ saved_at: number }>('SELECT saved_at FROM note_history WHERE note_id = ? ORDER BY saved_at DESC, id DESC LIMIT 1', [id]))[0];
      if (last && ts - last.saved_at < HISTORY_MERGE_MS) return [];
    }
    return [
      { sql: 'INSERT INTO note_history (note_id, text, saved_at) VALUES (?, ?, ?)', params: [id, current.text, ts] },
      { sql: 'DELETE FROM note_history WHERE note_id = ? AND id NOT IN (SELECT id FROM note_history WHERE note_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?)', params: [id, id, HISTORY_MAX_PER_NOTE] },
      { sql: 'DELETE FROM note_history WHERE saved_at < ?', params: [ts - HISTORY_MAX_AGE_MS] }
    ];
  }

  async function reorderScoped(ids: number[], category: string | null | undefined, requireTx: boolean): Promise<void> {
    const rows = await ex.query<{ id: number; pinned: number }>(
      `SELECT n.id AS id, coalesce(m.pinned, 0) AS pinned FROM notes n LEFT JOIN note_extra e ON e.note_id = n.id LEFT JOIN note_meta m ON m.note_id = n.id WHERE m.archived_at IS NULL AND ${NOT_TRASHED}` +
        (category ? ' AND n.category = ?' : '') + ' ORDER BY e.position IS NULL, e.position ASC, n.created_at DESC, n.id DESC',
      category ? [category] : []
    );
    const first = rows.find(r => ids.includes(r.id));
    if (!first) return;
    const order = reorderScope(rows.filter(r => r.pinned === first.pinned).map(r => r.id), ids);
    await ex.batch(order.map((id, i) => ({ sql: upsertExtra('position'), params: [id, i, id] })), requireTx ? { requireTransaction: true } : undefined);
  }

  /** Beklenen sürüm verildiyse kayıtla eşleştirir; kayıt yoksa (null) çakışma sayılmaz, yazma zaten etkisiz kalır. */
  async function assertVersion(id: number, expected?: number): Promise<void> {
    if (expected === undefined) return;
    const current = (await ex.query<{ updated_at: number }>('SELECT updated_at FROM notes WHERE id = ?', [id]))[0];
    if (current && current.updated_at !== expected) throw new NoteVersionConflict();
  }
  const versionClause = (expected?: number): string => (expected === undefined ? '' : ' AND updated_at = ?');
  const versionParams = (expected?: number): SqlParam[] => (expected === undefined ? [] : [expected]);
  /** Kontrol ile yazma arasında başka yazım araya girdiyse (koşullu UPDATE etkisiz kaldıysa) çakışma bildirir. */
  async function verifyWritten(id: number, ts: number, text: string, expected?: number): Promise<Note | null> {
    const note = await getById(id);
    if (expected !== undefined && note && !(note.updated_at === ts && note.text === text)) throw new NoteVersionConflict();
    return note;
  }

  return {
    /** Kategorideki not sayısı (çöptekiler ve arşivdekiler dahil; deleteCategory'nin taşıdığıyla aynı). */
    async countInCategory(id: string): Promise<number> {
      return Number((await ex.query<{ n: number }>('SELECT count(*) AS n FROM notes WHERE category = ?', [id]))[0]?.n ?? 0);
    },
    /** Tek not (çöptekiler dahil) ya da null. */
    getNote: getById,
    async savePage(id: number, text: string): Promise<void> {
      await ex.exec('INSERT OR REPLACE INTO note_pages (note_id, text, saved_at) VALUES (?, ?, ?)', [id, text, now()]);
    },
    async saveImage(id: number, dataUrl: string, width: number, height: number): Promise<void> {
      await ex.exec('INSERT OR REPLACE INTO note_images (note_id, data_url, width, height) VALUES (?, ?, ?, ?)', [id, dataUrl, width, height]);
    },
    async getPage(id: number): Promise<{ text: string } | null> {
      return (await ex.query<{ text: string }>('SELECT text FROM note_pages WHERE note_id = ?', [id]))[0] ?? null;
    },
    async getImage(id: number): Promise<{ data_url: string } | null> {
      return (await ex.query<{ data_url: string }>('SELECT data_url FROM note_images WHERE note_id = ?', [id]))[0] ?? null;
    },
    async attachments(ids: number[]): Promise<Array<{ note_id: number; kind: string }>> {
      if (!ids.length) return [];
      const placeholders = ids.map(() => '?').join(',');
      return ex.query(`SELECT note_id, 'page' AS kind FROM note_pages WHERE note_id IN (${placeholders}) UNION ALL SELECT note_id, 'image' AS kind FROM note_images WHERE note_id IN (${placeholders})`, [...ids, ...ids]);
    },
    async notesForUrl(url: string): Promise<Array<Pick<Note, 'id' | 'url' | 'text' | 'created_at'>>> {
      // Tüm notları her sayfa yüklemesinde çekmemek için önce SQL'de adresin yol kısmıyla süz
      // (sondaki "/", sorgu ve "#" farkları hâlâ eşleşir), kesin karşılaştırmayı sonra JS'te yap. Çöptekiler sayılmaz.
      const normalized = normalizeNoteUrl(url);
      const query = normalized.indexOf('?');
      const prefix = query < 0 ? normalized : normalized.slice(0, query);
      const notes = await ex.query<Pick<Note, 'id' | 'url' | 'text' | 'created_at'>>(
        `SELECT n.id, n.url, n.text, n.created_at FROM notes n WHERE n.url IS NOT NULL AND substr(n.url, 1, length(?)) = ? AND ${NOT_TRASHED} ORDER BY n.created_at DESC, n.id DESC`,
        [prefix, prefix]
      );
      return notes.filter(note => note.url !== null && normalizeNoteUrl(note.url) === normalized);
    },
    async addNote(input: NewNote): Promise<AddResult> {
      const text = checkText(input.text);
      await requireCategory(input.category);
      const url = input.url ?? null;

      const existing = await ex.query<Note>(
        `SELECT n.* FROM notes n WHERE n.url IS ? AND n.text = ? AND ${NOT_TRASHED} ORDER BY n.id LIMIT 1`,
        [url, text]
      );
      if (existing[0] && !input.allowDuplicate) return { note: existing[0], duplicate: true };

      const ts = now();
      const rows = await ex.query<Note>(
        'INSERT INTO notes (category, text, url, page_title, user_note, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, NULL, ?, ?) RETURNING *',
        [input.category, text, url, input.pageTitle ?? null, ts, ts]
      );
      return { note: rows[0], duplicate: false };
    },

    async listNotes(options: ListOptions = {}): Promise<Note[]> {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;
      // Masaüstünde arşivlenen ve çöpe atılan notlar listede gösterilmez; sabitlenenler önce gelir.
      const base = `${NOTE_SELECT} LEFT JOIN note_meta m ON m.note_id = n.id WHERE m.archived_at IS NULL AND ${NOT_TRASHED}`;
      const manual = options.sort === 'manual' ? 'e.position IS NULL, e.position ASC, ' : '';
      const order = ` ORDER BY coalesce(m.pinned, 0) DESC, ${manual}n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`;
      if (options.category) {
        return ex.query<Note>(base + ' AND n.category = ?' + order, [options.category, limit, offset]);
      }
      return ex.query<Note>(base + order, [limit, offset]);
    },

    async searchNotes(query: string, category?: NoteCategory | null): Promise<Note[]> {
      const match = buildFtsQuery(query);
      if (!match) return [];
      const sql =
        'SELECT n.*, e.color AS color, e.position AS position FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid LEFT JOIN note_extra e ON e.note_id = n.id LEFT JOIN note_meta m ON m.note_id = n.id ' +
        `WHERE notes_fts MATCH ? AND m.archived_at IS NULL AND ${NOT_TRASHED}` +
        (category ? ' AND n.category = ?' : '') +
        ' ORDER BY n.created_at DESC, n.id DESC LIMIT ?';
      const params = category ? [match, category, SEARCH_LIMIT] : [match, SEARCH_LIMIT];
      return ex.query<Note>(sql, params);
    },

    async setCategory(id: number, category: NoteCategory): Promise<Note | null> {
      await requireCategory(category);
      await ex.exec('UPDATE notes SET category = ?, updated_at = ? WHERE id = ?', [category, now(), id]);
      return getById(id);
    },

    /** Boş metin "notum"u temizler. Kayıt yoksa null döner. */
    async updateUserNote(id: number, text: string): Promise<Note | null> {
      const value = text.trim();
      await ex.exec('UPDATE notes SET user_note = ?, updated_at = ? WHERE id = ?', [value || null, now(), id]);
      return getById(id);
    },

    /**
     * Not metnini ve "notum" açıklamasını birlikte günceller; önceki metin geçmişe yazılır.
     * `expectedUpdatedAt` verilirse ve kayıttaki `updated_at` farklıysa NoteVersionConflict fırlatır (hiçbir şey yazılmaz).
     */
    async updateNote(id: number, text: string, userNote: string, expectedUpdatedAt?: number): Promise<Note | null> {
      const trimmed = checkText(text);
      const noteValue = userNote.trim() || null;
      await assertVersion(id, expectedUpdatedAt);
      const history = await historyStatements(id, trimmed);
      const ts = now();
      await ex.batch([...history, { sql: 'UPDATE notes SET text = ?, user_note = ?, updated_at = ? WHERE id = ?' + versionClause(expectedUpdatedAt), params: [trimmed, noteValue, ts, id, ...versionParams(expectedUpdatedAt)] }]);
      return verifyWritten(id, ts, trimmed, expectedUpdatedAt);
    },

    /** Yalnız metni günceller ("notum" korunur); önceki metin geçmişe yazılır. `expectedUpdatedAt` için updateNote'a bakın. */
    async updateNoteText(id: number, text: string, expectedUpdatedAt?: number): Promise<Note | null> {
      const trimmed = checkText(text);
      await assertVersion(id, expectedUpdatedAt);
      const history = await historyStatements(id, trimmed);
      const ts = now();
      await ex.batch([...history, { sql: 'UPDATE notes SET text = ?, updated_at = ? WHERE id = ?' + versionClause(expectedUpdatedAt), params: [trimmed, ts, id, ...versionParams(expectedUpdatedAt)] }]);
      return verifyWritten(id, ts, trimmed, expectedUpdatedAt);
    },

    /** Çöpe taşır (yumuşak silme). Geri yükleme ve kalıcı silme için aşağıdakilere bakın. */
    async deleteNote(id: number): Promise<void> {
      await ex.exec(upsertExtra('deleted_at'), [id, now(), id]);
    },

    /** Kalıcı siler: görsel, sayfa kopyası, meta, ek bilgi ve geçmiş dahil. Çöp süresine bakmaz. */
    purgeNote,
    /** İç kullanım (ör. ekran görüntüsü kaydını geri alma): çöpe uğramadan kalıcı siler. */
    hardDeleteNote: purgeNote,

    async listTrash(): Promise<Note[]> {
      return ex.query<Note>(
        'SELECT n.*, e.color AS color, e.position AS position, e.deleted_at AS deleted_at FROM notes n JOIN note_extra e ON e.note_id = n.id WHERE e.deleted_at IS NOT NULL ORDER BY e.deleted_at DESC, n.id DESC'
      );
    },
    trashCount,
    async restoreNote(id: number): Promise<Note | null> {
      await ex.exec('UPDATE note_extra SET deleted_at = NULL WHERE note_id = ?', [id]);
      return getById(id);
    },
    /** Çöpü boşaltır; silinen not sayısını döndürür. */
    async emptyTrash(): Promise<number> {
      const count = await trashCount();
      if (count) await ex.batch(purgeStatements('deleted_at IS NOT NULL', []));
      return count;
    },
    /** `days` günden uzun süredir çöpte olanları kalıcı siler (varsayılan 15); eski geçmişi de temizler. */
    async purgeExpired(nowMs: number = now(), days: number = TRASH_DAYS): Promise<number> {
      const cutoff = nowMs - days * DAY_MS;
      const count = Number((await ex.query<{ n: number }>('SELECT count(*) AS n FROM note_extra WHERE deleted_at IS NOT NULL AND deleted_at <= ?', [cutoff]))[0]?.n ?? 0);
      await ex.batch([
        ...(count ? purgeStatements('deleted_at IS NOT NULL AND deleted_at <= ?', [cutoff]) : []),
        { sql: 'DELETE FROM note_history WHERE saved_at < ?', params: [nowMs - HISTORY_MAX_AGE_MS] }
      ]);
      return count;
    },

    async setNoteColor(id: number, color: string | null): Promise<void> {
      if (color !== null && !isNoteColor(color)) throw new Error('Geçersiz renk');
      await ex.exec(upsertExtra('color'), [id, color, id]);
    },
    async setNotePosition(id: number, position: number): Promise<void> {
      if (!Number.isFinite(position)) throw new Error('Geçersiz konum');
      await ex.exec(upsertExtra('position'), [id, Math.trunc(position), id]);
    },
    /**
     * Elle sıralama. `ids` yalnız görünen satırlardır; kapsamın (kategori ya da tümü, aynı sabitleme grubu,
     * çöpte/arşivde olmayan) TAM sırası okunur, `ids`'in kapladığı yuvalara yeni sırayla konur ve tüm kapsam
     * 0..n yeniden numaralanır; yazım tek `batch` (tek işlem). Konumsuz notlar konumlulardan sonra, created_at azalan gelir.
     */
    async reorder(ids: number[], category?: string | null, opts: { transaction?: boolean } = {}): Promise<void> {
      if (!ids.length) return;
      if (!opts.transaction) return reorderScoped(ids, category, false);
      // Okuma + yazma tek açık işlemde; arka planda withExclusiveDb altında çağrılır, yazım requireTransaction ile.
      await ex.exec('BEGIN IMMEDIATE');
      try {
        await reorderScoped(ids, category, true);
        await ex.exec('COMMIT');
      } catch (error) {
        try { await ex.exec('ROLLBACK'); } catch { /* işlem zaten bitmiş olabilir */ }
        throw error;
      }
    },

    async listHistory(id: number): Promise<NoteHistoryRow[]> {
      return ex.query<NoteHistoryRow>('SELECT id, note_id, text, saved_at FROM note_history WHERE note_id = ? ORDER BY saved_at DESC, id DESC', [id]);
    },
    /** Geçmişteki metne döner; o anki metin önce geçmişe yazılır. */
    async restoreHistory(historyId: number): Promise<Note | null> {
      const row = (await ex.query<NoteHistoryRow>('SELECT id, note_id, text, saved_at FROM note_history WHERE id = ?', [historyId]))[0];
      if (!row) return null;
      const history = await historyStatements(row.note_id, row.text, true);
      await ex.batch([...history, { sql: 'UPDATE notes SET text = ?, updated_at = ? WHERE id = ?', params: [row.text, now(), row.note_id] }]);
      return getById(row.note_id);
    },

    categoryExists,
    async listCategories(): Promise<NoteCategoryRow[]> {
      return ex.query<NoteCategoryRow>('SELECT id, label, color, position, builtin, created_at FROM note_categories ORDER BY position, created_at, id');
    },
    async addCategory(label: string, color: string | null = null): Promise<NoteCategoryRow> {
      const text = label.trim();
      if (!text) throw new Error('Kategori adı boş olamaz');
      if (text.length > MAX_CATEGORY_LABEL) throw new Error(`Kategori adı en fazla ${MAX_CATEGORY_LABEL} karakter olmalı`);
      const existing = new Set((await ex.query<{ id: string }>('SELECT id FROM note_categories')).map(r => r.id));
      const base = slugifyCategoryId(text);
      let id = base;
      for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
      const position = Number((await ex.query<{ p: number | null }>('SELECT max(position) AS p FROM note_categories'))[0]?.p ?? -1) + 1;
      const createdAt = now();
      await ex.exec('INSERT INTO note_categories (id, label, color, position, builtin, created_at) VALUES (?, ?, ?, ?, 0, ?)', [id, text, color, position, createdAt]);
      return { id, label: text, color, position, builtin: 0, created_at: createdAt };
    },
    async renameCategory(id: string, label: string): Promise<void> {
      const text = label.trim();
      if (!text || text.length > MAX_CATEGORY_LABEL) throw new Error('Geçersiz kategori adı');
      await ex.exec('UPDATE note_categories SET label = ? WHERE id = ?', [text, id]);
    },
    async recolorCategory(id: string, color: string | null): Promise<void> {
      if (color !== null && !/^[#a-zA-Z0-9-]{1,20}$/.test(color)) throw new Error('Geçersiz renk');
      await ex.exec('UPDATE note_categories SET color = ? WHERE id = ?', [color, id]);
    },
    async reorderCategories(ids: string[]): Promise<void> {
      if (!ids.length) return;
      await ex.batch(ids.map((id, i) => ({ sql: 'UPDATE note_categories SET position = ? WHERE id = ?', params: [i, id] })));
    },
    /** "Notlar" silinemez. Kategorideki tüm notlar (çöptekiler dahil) tek işlemde "Notlar"a taşınır; taşınan sayıyı döndürür. */
    async deleteCategory(id: string): Promise<number> {
      if (id === DEFAULT_CATEGORY) throw new Error('"Notlar" kategorisi silinemez');
      if (!(await categoryExists(id))) return 0;
      const moved = Number((await ex.query<{ n: number }>('SELECT count(*) AS n FROM notes WHERE category = ?', [id]))[0]?.n ?? 0);
      await ex.batch([
        { sql: 'UPDATE notes SET category = ? WHERE category = ?', params: [DEFAULT_CATEGORY, id] },
        { sql: 'DELETE FROM note_categories WHERE id = ?', params: [id] }
      ]);
      return moved;
    },
    /** Eski yedek geri yüklendikten sonra yerleşik kategorileri geri koyar (tablo boşsa) ve "Notlar"ın var olmasını sağlar. */
    async ensureDefaultCategories(): Promise<void> {
      await ex.exec(NOTE_CATEGORY_SEED_SQL);
      await ex.exec("INSERT OR IGNORE INTO note_categories (id, label, color, position, builtin, created_at) VALUES ('note', 'Notlar', NULL, 0, 1, 0)");
    }
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
