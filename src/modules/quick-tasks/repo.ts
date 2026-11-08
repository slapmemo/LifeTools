import type { Executor } from '../../db/migrations';

export interface Task { id: number; title: string; note: string | null; url: string | null; due_date: string | null; done_at: number | null; created_at: number; updated_at: number }
export interface TaskInput { title: string; note?: string | null; url?: string | null; due_date?: string | null }

export function localToday(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function validate(input: TaskInput) {
  const title = input.title.trim();
  if (!title || title.length > 300) throw new Error('Görev başlığı 1–300 karakter olmalı.');
  const due = input.due_date || null;
  if (due) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due);
    if (!match) throw new Error('Geçerli bir tarih gir.');
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(0); date.setUTCHours(0, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Geçerli bir tarih gir.');
  }
  return { title, note: input.note ?? null, url: input.url ?? null, due };
}
export function createTasksRepo(ex: Executor, now: () => number = Date.now, changed: () => void = () => {}) {
  return {
    async add(input: TaskInput): Promise<Task> {
      const v = validate(input), ts = now();
      const task = (await ex.query<Task>('INSERT INTO tasks (title,note,url,due_date,done_at,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?) RETURNING *', [v.title,v.note,v.url,v.due,ts,ts]))[0]; changed(); return task;
    },
    async update(id: number, input: TaskInput): Promise<Task | null> {
      const v = validate(input);
      const task = (await ex.query<Task>('UPDATE tasks SET title=?, note=?, url=?, due_date=?, updated_at=? WHERE id=? RETURNING *', [v.title,v.note,v.url,v.due,now(),id]))[0] ?? null; changed(); return task;
    },
    async toggleDone(id: number): Promise<Task | null> {
      const ts = now();
      const task = (await ex.query<Task>('UPDATE tasks SET done_at=CASE WHEN done_at IS NULL THEN ? ELSE NULL END, updated_at=? WHERE id=? RETURNING *', [ts,ts,id]))[0] ?? null; changed(); return task;
    },
    async delete(id: number): Promise<void> { await ex.exec('DELETE FROM tasks WHERE id=?', [id]); changed(); },
    async listOpen(): Promise<Task[]> {
      return ex.query<Task>('SELECT * FROM tasks WHERE done_at IS NULL ORDER BY CASE WHEN due_date < ? THEN 0 WHEN due_date IS NOT NULL THEN 1 ELSE 2 END, due_date ASC, created_at ASC, id ASC', [localToday(now())]);
    },
    async listDone(): Promise<Task[]> { return ex.query<Task>('SELECT * FROM tasks WHERE done_at IS NOT NULL ORDER BY done_at DESC, id DESC LIMIT 50'); },
    async clearDone(): Promise<void> { await ex.exec('DELETE FROM tasks WHERE done_at IS NOT NULL'); changed(); }
  };
}
