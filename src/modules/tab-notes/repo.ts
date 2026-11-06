import type { Executor } from '../../db/migrations';
import { normalizeUrl } from '../life-browser/tabs';
export interface TabNote { url: string; note: string; created_at: number; updated_at: number }
export function createTabNotesRepo(ex: Executor, now: () => number = Date.now) {
  return {
    async get(url: string): Promise<TabNote | null> { return (await ex.query<TabNote>('SELECT * FROM tab_notes WHERE url = ?', [normalizeUrl(url)]))[0] ?? null; },
    async list(): Promise<TabNote[]> { return ex.query<TabNote>('SELECT * FROM tab_notes'); },
    async set(url: string, note: string): Promise<void> { const value = note.trim(); if (!value) return this.delete(url); const time = now(); await ex.exec('INSERT INTO tab_notes VALUES (?, ?, ?, ?) ON CONFLICT(url) DO UPDATE SET note=excluded.note, updated_at=excluded.updated_at', [normalizeUrl(url), value, time, time]); },
    async delete(url: string): Promise<void> { await ex.exec('DELETE FROM tab_notes WHERE url = ?', [normalizeUrl(url)]); }
  };
}
