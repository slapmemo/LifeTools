// Kaydedilemeyen satır içi düzenleme metnini not başına localStorage'a saklar; not yeniden düzenlenirken "Geri yükle" sunulur.

export const UNSAVED_PREFIX = 'lifetools_panel_note_unsaved_';

export interface UnsavedEntry { markdown: string; savedAt: number }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function stashUnsaved(store: Store, id: number, markdown: string, now: number = Date.now()): boolean {
  try { store.setItem(UNSAVED_PREFIX + id, JSON.stringify({ markdown, savedAt: now } satisfies UnsavedEntry)); return true; } catch { return false; }
}

export function readUnsaved(store: Store, id: number): UnsavedEntry | null {
  try {
    const raw = store.getItem(UNSAVED_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UnsavedEntry>;
    return typeof parsed.markdown === 'string' && typeof parsed.savedAt === 'number' ? { markdown: parsed.markdown, savedAt: parsed.savedAt } : null;
  } catch { return null; }
}

export function clearUnsaved(store: Store, id: number): void {
  try { store.removeItem(UNSAVED_PREFIX + id); } catch { /* yok say */ }
}

/**
 * Düzenleyiciyi kapatmadan önce çağrılır. Kaydedilirse true (varsa eski taslak silinir).
 * Kaydedilemezse (hata ya da çakışma) metin saklanır ve false döner: çağıran düzenleyiciyi kapatmamalı
 * (zorunlu kapatırsa metin yine de saklıdır).
 */
export async function flushOrStash(handle: { flush(): Promise<boolean>; getMarkdown(): string }, id: number, store: Store): Promise<boolean> {
  let ok = false;
  try { ok = await handle.flush(); } catch { ok = false; }
  if (ok) clearUnsaved(store, id);
  else stashUnsaved(store, id, handle.getMarkdown());
  return ok;
}
