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
    async addNote(input: NewNote): Promise<AddResult> {
      const text = input.text.trim();
      if (!text) throw new Error('Not metni boş olamaz');
      const url = input.url ?? null;

      const existing = await ex.query<Note>(
        'SELECT * FROM notes WHERE url IS ? AND text = ? ORDER BY id LIMIT 1',
        [url, text]
      );
      if (existing[0]) return { note: existing[0], duplicate: true };

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

    /** Boş metin "notum"u temizler. Kayıt yoksa null döner. */
    async updateUserNote(id: number, text: string): Promise<Note | null> {
      const value = text.trim();
      await ex.exec('UPDATE notes SET user_note = ?, updated_at = ? WHERE id = ?', [value || null, now(), id]);
      return getById(id);
    },

    async deleteNote(id: number): Promise<void> {
      await ex.exec('DELETE FROM notes WHERE id = ?', [id]);
    }
  };
}

export type NotesRepo = ReturnType<typeof createNotesRepo>;
