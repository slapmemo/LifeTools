import type { NewNote } from '../slapmemo/repo';
import type { TabNote } from './repo';
export async function transferTabNote(url: string, title: string, notes: { get(url: string): Promise<TabNote | null>; delete(url: string): Promise<void> }, memo: { addNote(input: NewNote): Promise<unknown> }): Promise<boolean> {
  const note = await notes.get(url); if (!note) return false;
  await memo.addNote({ category: 'note', text: note.note, url: note.url, pageTitle: title || null });
  await notes.delete(url); return true;
}
