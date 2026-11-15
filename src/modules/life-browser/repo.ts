import type { Executor } from '../../db/migrations';
import type { SessionTabInput } from './tabs';

export interface Session { id: number; name: string; created_at: number; tab_count: number }
export interface SessionTab { id: number; session_id: number; position: number; url: string; title: string | null; pinned: number; group_title: string | null; group_color: string | null; note: string | null }

const MAX_NAME = 100;
export const AUTO_PREFIX = 'Kapanan pencere — ';
export const HIDDEN_PREFIX = 'Gizli grup — ';
export function oldAutoSessionIds(sessions: readonly Session[]): number[] {
  return sessions.filter(s => s.name.startsWith(AUTO_PREFIX)).sort((a, b) => b.created_at - a.created_at || b.id - a.id).slice(5).map(s => s.id);
}

const INSERT_TAB = 'INSERT INTO session_tabs (id, session_id, position, url, title, pinned, group_title, group_color, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
const tabParams = (id: number, sessionId: number, position: number, tab: SessionTabInput): (string | number | null)[] =>
  [id, sessionId, position, tab.url, tab.title, tab.pinned ? 1 : 0, tab.group_title, tab.group_color, tab.note ?? null];
const isUniqueConflict = (err: unknown): boolean => /UNIQUE/i.test(err instanceof Error ? err.message : String(err));

/**
 * Kimlikleri önceden ayırıp tüm yazmaları tek `batch` (tek işlem) içinde yapar.
 * Araya başka bir yazma girip kimlik çakışırsa işlem bütünüyle geri alınır ve yeniden denenir.
 */
async function withReservedIds<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tries = 0; ; tries++) {
    try { return await attempt(); }
    catch (err) { if (tries >= 4 || !isUniqueConflict(err)) throw err; }
  }
}

export function createSessionsRepo(ex: Executor, now: () => number = Date.now) {
  const nextId = async (table: 'sessions' | 'session_tabs'): Promise<number> =>
    Number((await ex.query<{ id: number | null }>(`SELECT MAX(id) AS id FROM ${table}`))[0]?.id ?? 0) + 1;
  const deleteIfEmpty = (sessionId: number) => ({ sql: 'DELETE FROM sessions WHERE id = ? AND NOT EXISTS (SELECT 1 FROM session_tabs WHERE session_id = ?)', params: [sessionId, sessionId] });
  return {
    /** Oturumu ve sekmelerini tek işlemde kaydeder; yeni oturum kimliğini döndürür. */
    async save(name: string, tabs: readonly SessionTabInput[]): Promise<number> {
      const trimmed = name.trim();
      if (!trimmed || (trimmed.startsWith(HIDDEN_PREFIX) ? !trimmed.slice(HIDDEN_PREFIX.length).trim() : trimmed.length > MAX_NAME)) throw new Error(`Oturum adı 1–${MAX_NAME} karakter olmalı.`);
      if (!tabs.length) throw new Error('Kaydedilecek sekme yok.');
      return withReservedIds(async () => {
        const id = await nextId('sessions');
        const firstTab = await nextId('session_tabs');
        await ex.batch([
          { sql: 'INSERT INTO sessions (id, name, created_at) VALUES (?, ?, ?)', params: [id, trimmed, now()] },
          ...tabs.map((tab, position) => ({ sql: INSERT_TAB, params: tabParams(firstTab + position, id, position, tab) }))
        ]);
        return id;
      });
    },
    /** Var olan oturumun sonuna (sıradaki konumlardan) sekme ekler; tek işlemde. Eklenen satır kimliklerini döndürür. */
    async appendTabs(sessionId: number, tabs: readonly SessionTabInput[]): Promise<number[]> {
      if (!tabs.length) throw new Error('Kaydedilecek sekme yok.');
      return withReservedIds(async () => {
        const exists = await ex.query<{ id: number }>('SELECT id FROM sessions WHERE id = ?', [sessionId]);
        if (!exists.length) throw new Error('Kayıtlı grup bulunamadı.');
        const start = Number((await ex.query<{ position: number | null }>('SELECT MAX(position) AS position FROM session_tabs WHERE session_id = ?', [sessionId]))[0]?.position ?? -1) + 1;
        const firstTab = await nextId('session_tabs');
        const ids = tabs.map((_, i) => firstTab + i);
        await ex.batch(tabs.map((tab, i) => ({
          sql: 'INSERT INTO session_tabs (id, session_id, position, url, title, pinned, group_title, group_color, note) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?)',
          params: [...tabParams(ids[i], sessionId, start + i, tab), sessionId]
        })));
        const inserted = await ex.query<{ id: number }>(`SELECT id FROM session_tabs WHERE session_id = ? AND id IN (${ids.map(() => '?').join(', ')})`, [sessionId, ...ids]);
        if (inserted.length !== ids.length) {
          if (inserted.length) await ex.batch([{ sql: `DELETE FROM session_tabs WHERE session_id = ? AND id IN (${inserted.map(() => '?').join(', ')})`, params: [sessionId, ...inserted.map(row => row.id)] }]);
          throw new Error('Kayıtlı grup bulunamadı.');
        }
        return ids;
      });
    },
    /** Gizli grubu adına göre (önek + kırpılmış ad, birebir) bulur; en yenisi önce. */
    async moveTab(fromSessionId: number, tabRowId: number, toSessionId: number): Promise<void> {
      if (fromSessionId === toSessionId) return;
      await withReservedIds(async () => {
        const id = await nextId('session_tabs');
        await ex.batch([
          { sql: `INSERT INTO session_tabs (id, session_id, position, url, title, pinned, group_title, group_color, note) SELECT ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM session_tabs WHERE session_id = ?), url, title, pinned, (SELECT group_title FROM session_tabs WHERE session_id = ? ORDER BY position, id LIMIT 1), (SELECT group_color FROM session_tabs WHERE session_id = ? ORDER BY position, id LIMIT 1), note FROM session_tabs WHERE id = ? AND session_id = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ?)`, params: [id, toSessionId, toSessionId, toSessionId, toSessionId, tabRowId, fromSessionId, toSessionId] },
          { sql: 'DELETE FROM session_tabs WHERE id = ? AND session_id = ? AND EXISTS (SELECT 1 FROM session_tabs WHERE id = ? AND session_id = ?)', params: [tabRowId, fromSessionId, id, toSessionId] },
          deleteIfEmpty(fromSessionId)
        ]);
      });
    },
    async setTabNote(sessionId: number, tabRowId: number, note: string): Promise<void> {
      const value = note.trim();
      if (value.length > 500) throw new Error('Not en fazla 500 karakter olabilir.');
      await ex.batch([{ sql: 'UPDATE session_tabs SET note = ? WHERE session_id = ? AND id = ?', params: [value || null, sessionId, tabRowId] }]);
    },
    async reorderTabs(sessionId: number, orderedTabRowIds: readonly number[]): Promise<void> {
      if (!orderedTabRowIds.length) return;
      await ex.batch(orderedTabRowIds.map((id, position) => ({ sql: 'UPDATE session_tabs SET position = ? WHERE session_id = ? AND id = ?', params: [position, sessionId, id] })));
    },
    async findHiddenByName(name: string): Promise<Session[]> {
      const trimmed = name.trim();
      if (!trimmed) return [];
      return ex.query<Session>('SELECT s.id, s.name, s.created_at, (SELECT COUNT(*) FROM session_tabs t WHERE t.session_id = s.id) AS tab_count FROM sessions s WHERE trim(s.name) = ? ORDER BY s.created_at DESC, s.id DESC', [HIDDEN_PREFIX + trimmed]);
    },
    async list(): Promise<Session[]> {
      return ex.query<Session>('SELECT s.id, s.name, s.created_at, (SELECT COUNT(*) FROM session_tabs t WHERE t.session_id = s.id) AS tab_count FROM sessions s ORDER BY s.created_at DESC, s.id DESC');
    },
    async tabs(sessionId: number): Promise<SessionTab[]> {
      return ex.query<SessionTab>('SELECT * FROM session_tabs WHERE session_id = ? ORDER BY position ASC, id ASC', [sessionId]);
    },
    async rename(sessionId: number, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed || (trimmed.startsWith(HIDDEN_PREFIX) ? !trimmed.slice(HIDDEN_PREFIX.length).trim() : trimmed.length > MAX_NAME)) throw new Error(`Oturum adı 1–${MAX_NAME} karakter olmalı.`);
      await ex.exec('UPDATE sessions SET name = ? WHERE id = ?', [trimmed, sessionId]);
    },
    /** Sekme kaydını kaldırır; oturum boşalırsa oturumu da siler (tek işlemde). */
    async removeTab(sessionId: number, tabId: number): Promise<void> {
      await ex.batch([{ sql: 'DELETE FROM session_tabs WHERE session_id = ? AND id = ?', params: [sessionId, tabId] }, deleteIfEmpty(sessionId)]);
    },
    /** Birden çok sekme kaydını kaldırır; oturum boşalırsa oturumu da siler (tek işlemde). */
    async removeTabs(sessionId: number, tabIds: readonly number[]): Promise<void> {
      if (!tabIds.length) return;
      await ex.batch([...tabIds.map(tabId => ({ sql: 'DELETE FROM session_tabs WHERE session_id = ? AND id = ?', params: [sessionId, tabId] })), deleteIfEmpty(sessionId)]);
    },
    async removeHiddenTab(sessionId: number, tabId: number): Promise<void> {
      await ex.batch([
        { sql: 'DELETE FROM session_tabs WHERE session_id = ? AND id = ? AND EXISTS (SELECT 1 FROM sessions WHERE id = ? AND substr(name, 1, ?) = ?)', params: [sessionId, tabId, sessionId, HIDDEN_PREFIX.length, HIDDEN_PREFIX] },
        { sql: 'DELETE FROM sessions WHERE id = ? AND substr(name, 1, ?) = ? AND NOT EXISTS (SELECT 1 FROM session_tabs WHERE session_id = ?)', params: [sessionId, HIDDEN_PREFIX.length, HIDDEN_PREFIX, sessionId] }
      ]);
    },
    async delete(sessionId: number): Promise<void> { await ex.exec('DELETE FROM sessions WHERE id = ?', [sessionId]); }
  };
}
export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
