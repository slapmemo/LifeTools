import type { Executor } from '../../db/migrations';
import type { NoteCategory } from './categories';

export interface Note {
  id: number;
  category: NoteCategory;
  text: string;
  url: string | null;
  page_title: string | null;
  user_note: string | null;
  created_at: number;
  updated_at: number;
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
}

const SEARCH_LIMIT = 100;

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

export function createNotesRepo(ex: Executor, now: () => number = Date.now) {
  async function getById(id: number): Promise<Note | null> {
    const rows = await ex.query<Note>('SELECT * FROM notes WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  return {
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
    async notesForUrl(url: string): Promise<Note[]> {
      const notes = await ex.query<Note>('SELECT * FROM notes WHERE url IS NOT NULL ORDER BY created_at DESC, id DESC');
      const normalized = normalizeNoteUrl(url);
      return notes.filter(note => note.url !== null && normalizeNoteUrl(note.url) === normalized);
    },
    async addNote(input: NewNote): Promise<AddResult> {
      const text = input.text.trim();
      if (!text) throw new Error('Not metni boş olamaz');
      const url = input.url ?? null;

      const existing = await ex.query<Note>(
        'SELECT * FROM notes WHERE url IS ? AND text = ? ORDER BY id LIMIT 1',
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
      if (options.category) {
        return ex.query<Note>(
          'SELECT * FROM notes WHERE category = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
          [options.category, limit, offset]
        );
      }
      return ex.query<Note>('SELECT * FROM notes ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?', [
        limit,
        offset
      ]);
    },

    async searchNotes(query: string, category?: NoteCategory | null): Promise<Note[]> {
      const match = buildFtsQuery(query);
      if (!match) return [];
      const sql =
        'SELECT n.* FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid WHERE notes_fts MATCH ?' +
        (category ? ' AND n.category = ?' : '') +
        ' ORDER BY n.created_at DESC, n.id DESC LIMIT ?';
      const params = category ? [match, category, SEARCH_LIMIT] : [match, SEARCH_LIMIT];
      return ex.query<Note>(sql, params);
    },

    async setCategory(id: number, category: NoteCategory): Promise<Note | null> {
      await ex.exec('UPDATE notes SET category = ?, updated_at = ? WHERE id = ?', [category, now(), id]);
      return getById(id);
    },

    /** Boş metin "notum"u temizler. Kayıt yoksa null döner. */
    async updateUserNote(id: number, text: string): Promise<Note | null> {
      const value = text.trim();
      await ex.exec('UPDATE notes SET user_note = ?, updated_at = ? WHERE id = ?', [value || null, now(), id]);
      return getById(id);
    },

    /** Not metnini ve "notum" açıklamasını birlikte günceller. */
    async updateNote(id: number, text: string, userNote: string): Promise<Note | null> {
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Not metni boş olamaz');
      const noteValue = userNote.trim() || null;
      await ex.exec('UPDATE notes SET text = ?, user_note = ?, updated_at = ? WHERE id = ?', [trimmed, noteValue, now(), id]);
      return getById(id);
    },

    async deleteNote(id: number): Promise<void> {
      await ex.batch([{ sql: 'DELETE FROM note_images WHERE note_id = ?', params: [id] }, { sql: 'DELETE FROM note_pages WHERE note_id = ?', params: [id] }, { sql: 'DELETE FROM notes WHERE id = ?', params: [id] }]);
    }
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
