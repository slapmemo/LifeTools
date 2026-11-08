import { backgroundDb } from '../../db/host';
import { createSessionsRepo } from '../life-browser/repo';
import type { SessionTabInput } from '../life-browser/tabs';

export function migrationSessions(value: unknown): { name: string; tabs: SessionTabInput[] }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || !Array.isArray(item.tabs)) return [];
    const tabs: SessionTabInput[] = item.tabs.flatMap((tab: unknown) => {
      if (!tab || typeof tab !== 'object') return [];
      const entry = tab as Record<string, unknown>;
      if (typeof entry.url !== 'string' || !/^(https?:\/\/|file:\/\/)/i.test(entry.url)) return [];
      try { new URL(entry.url); } catch { return []; }
      return [{ url: entry.url, title: typeof entry.title === 'string' ? entry.title : null, pinned: false, group_title: null, group_color: null }];
    });
    if (!tabs.length) return [];
    const label = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'Adsız';
    return [{ name: `Çalışma alanı: ${label}`.slice(0, 100), tabs }];
  });
}

let pending: Promise<void> | undefined;
export function migrateStoredSessions(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    try {
      const stored = await chrome.storage.local.get('workspaces');
      const repo = createSessionsRepo(backgroundDb);
      for (const session of migrationSessions(stored.workspaces)) await repo.save(session.name, session.tabs);
      await chrome.storage.session.remove('windowWorkspace');
      await chrome.storage.local.remove(['workspaces', 'workspaceMode', 'lastWorkspaceId']);
    } catch (error) { console.error('Çalışma alanları oturumlara taşınamadı', error); }
  })().finally(() => { pending = undefined; });
  return pending;
}
