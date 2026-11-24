// @vitest-environment happy-dom
import { beforeEach, expect, test, vi } from 'vitest';

const now = Date.now();
const mk = (id: number, extra: Record<string, unknown> = {}) => ({
  id, category: 'note', text: `Not ${id}`, url: null, page_title: null, user_note: null, created_at: now - id, updated_at: now - id,
  pinned: false, done_at: null, archived_at: null, remind_at: null, has_page: false, has_image: false, color: null, position: null, deleted_at: null, ...extra
});
const cats = [
  { id: 'note', label: 'Notlar', color: null, position: 0, builtin: true, created_at: 0 },
  { id: 'is', label: 'İş', color: 'blue', position: 1, builtin: false, created_at: 1 }
];
const calls: Array<[string, unknown]> = [];
vi.mock('../desktop/node_modules/@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args: unknown) => {
    calls.push([cmd, args]);
    if (cmd === 'note_list') return { available: true, notes: [mk(1, { color: 'pink' }), mk(2, { category: 'is' })], counts: { all: 2, note: 1, read: 0, watch: 0, idea: 0, archived: 0, trash: 1, by_category: { note: 1, is: 1 } } };
    if (cmd === 'note_categories') return cats;
    if (cmd === 'note_trash_list') return [mk(9, { deleted_at: now - 3 * 86_400_000 })];
    return null;
  }
}));

beforeEach(() => { document.body.innerHTML = ''; calls.length = 0; localStorage.clear(); });

test('notlar: kullanıcı kategorileri sekme olur, renk şeridi, çöp sekmesi ve kalan gün', async () => {
  const { notesView } = await import('../desktop/src/views/notlar');
  const v = notesView();
  document.body.append(v.el);
  await v.refresh();
  const tabs = [...v.el.querySelectorAll('[role="tab"]')].map((t) => t.textContent);
  expect(tabs.join('|')).toContain('İş');
  expect(tabs.at(-1)).toContain('Çöp kutusu');
  expect(v.el.querySelector('.note-row[data-color="pink"]')).not.toBeNull();

  const trashTab = [...v.el.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.includes('Çöp kutusu'))!;
  trashTab.click();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  expect(v.el.textContent).toContain('12 gün sonra kalıcı olarak silinecek');
  expect(v.el.textContent).toContain('Çöpü boşalt');
  // Çöpü boşalt: sayfa içi onay ister, hemen silmez.
  [...v.el.querySelectorAll<HTMLElement>('.trash-bar button')][0].click();
  expect(v.el.querySelector('.trash-bar')!.textContent).toContain('kalıcı olarak silinecek');
  expect(calls.some(([c]) => c === 'note_trash_empty')).toBe(false);
});
