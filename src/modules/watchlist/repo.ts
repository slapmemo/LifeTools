import type { Executor } from '../../db/migrations';
export type Kind = 'film' | 'dizi' | 'video' | 'diger';
export type Status = 'izlenecek' | 'izleniyor' | 'bitti';
export interface WatchItem { id: number; title: string; kind: Kind; status: Status; url: string | null; note: string | null; created_at: number; updated_at: number }
export interface WatchInput { title: string; kind: Kind; url?: string | null; note?: string | null }
export function guessKind(raw: string): Kind { try { const host = new URL(raw).hostname.toLowerCase(); return ['youtube.com','youtu.be','vimeo.com'].some(x => host === x || host.endsWith('.' + x)) ? 'video' : 'diger'; } catch { return 'diger'; } }
export function createWatchRepo(ex: Executor, now: () => number = Date.now) {
  const title = (s: string) => { const v = s.trim(); if (!v || v.length > 300) throw new Error('Başlık 1–300 karakter olmalı.'); return v; };
  return {
    async add(input: WatchInput): Promise<WatchItem> { const t = now(); return (await ex.query<WatchItem>('INSERT INTO watch_items (title,kind,url,note,created_at,updated_at) VALUES (?,?,?,?,?,?) RETURNING *', [title(input.title),input.kind,input.url ?? null,input.note ?? null,t,t]))[0]; },
    async update(id: number, input: WatchInput): Promise<WatchItem | null> { return (await ex.query<WatchItem>('UPDATE watch_items SET title=?,kind=?,url=?,note=?,updated_at=? WHERE id=? RETURNING *', [title(input.title),input.kind,input.url ?? null,input.note ?? null,now(),id]))[0] ?? null; },
    async setStatus(id: number, status: Status): Promise<WatchItem | null> { return (await ex.query<WatchItem>('UPDATE watch_items SET status=?,updated_at=? WHERE id=? RETURNING *', [status,now(),id]))[0] ?? null; },
    async delete(id: number): Promise<void> { await ex.exec('DELETE FROM watch_items WHERE id=?', [id]); },
    async list(status?: Status, kind?: Kind, search?: string): Promise<WatchItem[]> { const clauses: string[] = []; const params: string[] = []; if (status) { clauses.push('status=?'); params.push(status); } if (kind) { clauses.push('kind=?'); params.push(kind); } if (search?.trim()) { clauses.push("(title LIKE ? OR coalesce(note,'') LIKE ?)"); params.push('%'+search.trim()+'%', '%'+search.trim()+'%'); } return ex.query<WatchItem>('SELECT * FROM watch_items'+(clauses.length ? ' WHERE '+clauses.join(' AND ') : '')+' ORDER BY updated_at DESC, id DESC',params); }
  };
}
