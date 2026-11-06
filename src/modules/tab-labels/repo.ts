import type { Executor } from '../../db/migrations';
import { normalizeUrl } from '../life-browser/tabs';
export interface TabLabel { url: string; label: string; updated_at: number }
export function createTabLabelsRepo(ex: Executor, now: () => number = Date.now) {
  return {
    async get(url: string): Promise<TabLabel | null> { return (await ex.query<TabLabel>('SELECT * FROM tab_labels WHERE url = ?', [normalizeUrl(url)]))[0] ?? null; },
    async list(): Promise<TabLabel[]> { return ex.query<TabLabel>('SELECT * FROM tab_labels'); },
    async set(url: string, label: string): Promise<void> { const value = label.trim(); if (!value) return this.delete(url); await ex.exec('INSERT INTO tab_labels VALUES (?, ?, ?) ON CONFLICT(url) DO UPDATE SET label=excluded.label, updated_at=excluded.updated_at', [normalizeUrl(url), value, now()]); },
    async delete(url: string): Promise<void> { await ex.exec('DELETE FROM tab_labels WHERE url = ?', [normalizeUrl(url)]); }
  };
}
