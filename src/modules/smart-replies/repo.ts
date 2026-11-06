import type { Executor } from '../../db/migrations';
export interface Snippet { id: number; trigger: string; title: string; body: string; use_count: number; created_at: number; updated_at: number }
export interface SnippetInput { trigger: string; title: string; body: string }
export function validateTrigger(value: string): string {
  const trigger = value.trim().toLocaleLowerCase('tr-TR');
  if (!/^[/;][a-z0-9_\u00e7\u011f\u0131\u00f6\u015f\u00fc-]{1,31}$/u.test(trigger)) throw new Error('Tetikleyici / veya ; ile başlamalı ve 1–31 harf, rakam, _ veya - içermeli.');
  return trigger;
}
export function createSnippetsRepo(ex: Executor, now: () => number = Date.now) {
  async function getByTrigger(trigger: string): Promise<Snippet | null> {
    return (await ex.query<Snippet>('SELECT * FROM snippets WHERE trigger = ?', [validateTrigger(trigger)]))[0] ?? null;
  }
  async function prepare(input: SnippetInput, id?: number) {
    const trigger = validateTrigger(input.trigger);
    if (!input.title.trim() || !input.body.trim()) throw new Error('Başlık ve metin boş olamaz.');
    const existing = await getByTrigger(trigger);
    if (existing && existing.id !== id) throw new Error('Bu tetikleyici zaten kullanılıyor.');
    return [trigger, input.title.trim(), input.body] as const;
  }
  function duplicate(err: unknown): never {
    if (String(err).includes('UNIQUE')) throw new Error('Bu tetikleyici zaten kullanılıyor.');
    throw err;
  }
  return {
    getByTrigger,
    async add(input: SnippetInput): Promise<Snippet> {
      const [trigger, title, body] = await prepare(input); const ts = now();
      try { return (await ex.query<Snippet>('INSERT INTO snippets (trigger,title,body,created_at,updated_at) VALUES (?,?,?,?,?) RETURNING *', [trigger,title,body,ts,ts]))[0]; } catch (err) { return duplicate(err); }
    },
    async update(id: number, input: SnippetInput): Promise<Snippet | null> {
      const [trigger,title,body] = await prepare(input,id);
      try { return (await ex.query<Snippet>('UPDATE snippets SET trigger=?, title=?, body=?, updated_at=? WHERE id=? RETURNING *', [trigger,title,body,now(),id]))[0] ?? null; } catch (err) { return duplicate(err); }
    },
    async delete(id: number): Promise<void> { await ex.exec('DELETE FROM snippets WHERE id=?', [id]); },
    async list(search = ''): Promise<Snippet[]> { const q = `%${search}%`; return ex.query<Snippet>('SELECT * FROM snippets WHERE trigger LIKE ? OR title LIKE ? OR body LIKE ? ORDER BY use_count DESC, id DESC', [q,q,q]); },
    async incrementUse(id: number): Promise<void> { await ex.exec('UPDATE snippets SET use_count=use_count+1 WHERE id=?', [id]); }
  };
}
