import type { Executor } from '../../db/migrations';
import type { SessionTabInput } from './tabs';

export interface Session { id: number; name: string; created_at: number; tab_count: number }
export interface SessionTab { id: number; session_id: number; position: number; url: string; title: string | null; pinned: number; group_title: string | null; group_color: string | null }

const MAX_NAME = 100;
export const AUTO_PREFIX = 'Kapanan pencere — ';
export function oldAutoSessionIds(sessions: readonly Session[]): number[] {
  return sessions.filter(s => s.name.startsWith(AUTO_PREFIX)).sort((a, b) => b.created_at - a.created_at || b.id - a.id).slice(5).map(s => s.id);
}

export function createSessionsRepo(ex: Executor, now: () => number = Date.now) {
  return {
    /** Oturumu ve sekmelerini kaydeder; yeni oturum kimliğini döndürür. */
    async save(name: string, tabs: readonly SessionTabInput[]): Promise<number> {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > MAX_NAME) throw new Error(`Oturum adı 1–${MAX_NAME} karakter olmalı.`);
      if (!tabs.length) throw new Error('Kaydedilecek sekme yok.');
      const id = (await ex.query<{ id: number }>('INSERT INTO sessions (name, created_at) VALUES (?, ?) RETURNING id', [trimmed, now()]))[0].id;
      try {
        await ex.batch(tabs.map((tab, position) => ({
          sql: 'INSERT INTO session_tabs (session_id, position, url, title, pinned, group_title, group_color) VALUES (?, ?, ?, ?, ?, ?, ?)',
          params: [id, position, tab.url, tab.title, tab.pinned ? 1 : 0, tab.group_title, tab.group_color]
        })));
      } catch (err) {
        await ex.exec('DELETE FROM sessions WHERE id = ?', [id]);
        throw err;
      }
      return id;
    },
    async list(): Promise<Session[]> {
      return ex.query<Session>('SELECT s.id, s.name, s.created_at, (SELECT COUNT(*) FROM session_tabs t WHERE t.session_id = s.id) AS tab_count FROM sessions s ORDER BY s.created_at DESC, s.id DESC');
    },
    async tabs(sessionId: number): Promise<SessionTab[]> {
      return ex.query<SessionTab>('SELECT * FROM session_tabs WHERE session_id = ? ORDER BY position ASC, id ASC', [sessionId]);
    },
    async rename(sessionId: number, name: string): Promise<void> {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > MAX_NAME) throw new Error(`Oturum adı 1–${MAX_NAME} karakter olmalı.`);
      await ex.exec('UPDATE sessions SET name = ? WHERE id = ?', [trimmed, sessionId]);
    },
    async removeTab(sessionId: number, tabId: number): Promise<void> {
      await ex.exec('DELETE FROM session_tabs WHERE session_id = ? AND id = ?', [sessionId, tabId]);
    },
    async delete(sessionId: number): Promise<void> { await ex.exec('DELETE FROM sessions WHERE id = ?', [sessionId]); }
  };
}
export type SessionsRepo = ReturnType<typeof createSessionsRepo>;
