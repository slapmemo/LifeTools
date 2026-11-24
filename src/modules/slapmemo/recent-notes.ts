// "Geri al" için son kaydedilen notların kimlikleri. Service worker uykuya geçip yeniden başlayabildiğinden
// bellekteki Map yetmez (başlayınca boş kalır, geri alma sessizce reddedilirdi); chrome.storage.session'a da yazılır.

export const RECENT_KEY = 'slapmemoRecentSaves';
export const UNDO_WINDOW_MS = 120_000;

export interface SessionLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export function createRecentStore(session: SessionLike | undefined) {
  const memory = new Map<number, number>();
  let hydrated = false;

  async function hydrate(): Promise<void> {
    if (hydrated) return;
    hydrated = true;
    try {
      const stored = (await session?.get(RECENT_KEY))?.[RECENT_KEY];
      if (stored && typeof stored === 'object') {
        for (const [id, at] of Object.entries(stored as Record<string, unknown>)) {
          if (typeof at === 'number' && !memory.has(Number(id))) memory.set(Number(id), at);
        }
      }
    } catch { /* yalnız bellek */ }
  }

  async function persist(now: number): Promise<void> {
    for (const [id, at] of memory) if (now - at > UNDO_WINDOW_MS) memory.delete(id);
    try { await session?.set({ [RECENT_KEY]: Object.fromEntries(memory) }); } catch { /* yok say */ }
  }

  return {
    async remember(id: number, now: number = Date.now()): Promise<void> {
      await hydrate();
      memory.set(id, now);
      await persist(now);
    },
    async isRecent(id: unknown, now: number = Date.now()): Promise<boolean> {
      if (!Number.isSafeInteger(id)) return false;
      await hydrate();
      const at = memory.get(id as number);
      return at !== undefined && now - at <= UNDO_WINDOW_MS;
    },
    async forget(id: number, now: number = Date.now()): Promise<void> {
      await hydrate();
      memory.delete(id);
      await persist(now);
    }
  };
}
