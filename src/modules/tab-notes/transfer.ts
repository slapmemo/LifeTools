import type { NewNote } from '../slapmemo/repo';
import type { TabNote } from './repo';
import { normalizeUrl } from '../life-browser/tabs';

/** Kapanan sekmenin adresi başka bir açık sekmede de varsa not taşınmamalı; açık kalan sekmede durmalı. */
export function isUrlStillOpen(url: string, openUrls: Iterable<string | undefined>): boolean {
  const key = normalizeUrl(url);
  for (const other of openUrls) if (other && normalizeUrl(other) === key) return true;
  return false;
}
export async function transferTabNote(url: string, title: string, notes: { get(url: string): Promise<TabNote | null>; delete(url: string): Promise<void> }, memo: { addNote(input: NewNote): Promise<unknown> }): Promise<boolean> {
  const note = await notes.get(url); if (!note) return false;
  await memo.addNote({ category: 'note', text: note.note, url: note.url, pageTitle: title || null });
  await notes.delete(url); return true;
}
