import type { IconName } from '../../design/icons';
import { resolveEnabled } from './module-state';

export const groups = [
  { id: 'notlar', label: 'Notlar', icon: 'notebook-pen', star: true, modules: ['slapmemo', 'watchlist'] },
  { id: 'gorevler', label: 'Görevler', icon: 'list-checks', star: true, modules: ['quick-tasks'] },
  { id: 'metin', label: 'Metin', icon: 'text-cursor-input', star: true, modules: ['smart-replies', 'clip-slots', 'link-cleaner'] },
  {
    id: 'sekmeler',
    label: 'Sekmeler',
    icon: 'layout-grid',
    star: false,
    modules: ['life-browser', 'zombie-tabs', 'pinned-guard', 'tab-labels', 'tab-notes', 'title-cleaner', 'tab-switcher', 'site-toolbar']
  },
  { id: 'odak', label: 'Odak', icon: 'timer', star: false, modules: ['site-blocker', 'time-tracker'] },
  { id: 'medya', label: 'Medya', icon: 'clapperboard', star: false, modules: ['x-video', 'instagram', 'pip'] },
  { id: 'ayarlar', label: 'Ayarlar', icon: 'settings', star: false, modules: [] }
] as const;

export type NotlarSubTab = 'slapmemo' | 'watchlist';
export type MetinSubTab = 'smart-replies' | 'clip-slots' | 'link-cleaner';
export type SekmelerSubTab = 'oturumlar' | 'temizlik' | 'etiket-notlar' | 'arac-cubugu';
export type OdakSubTab = 'engelleyici' | 'sureler';

export function categories(flags: unknown) {
  return groups.filter(g => !g.modules.length || g.modules.some(id => resolveEnabled(flags, id)));
}

export function routeCategory(hash: string, visible: readonly { id: string }[]): string {
  const id = hash.replace(/^#/, '');
  return visible.some(g => g.id === id) ? id : (visible.find(g => g.id === 'notlar')?.id ?? visible[0]?.id ?? 'ayarlar');
}

export function popupVisibility(flags: unknown) {
  return {
    notes: resolveEnabled(flags, 'slapmemo'),
    tasks: resolveEnabled(flags, 'quick-tasks'),
    sites: resolveEnabled(flags, 'time-tracker'),
    search: resolveEnabled(flags, 'command-center'),
    snippets: resolveEnabled(flags, 'smart-replies')
  };
}

export function notlarTabs(flags: unknown): NotlarSubTab[] {
  const out: NotlarSubTab[] = [];
  if (resolveEnabled(flags, 'slapmemo')) out.push('slapmemo');
  if (resolveEnabled(flags, 'watchlist')) out.push('watchlist');
  return out;
}

export function metinTabs(flags: unknown): MetinSubTab[] {
  const out: MetinSubTab[] = [];
  if (resolveEnabled(flags, 'smart-replies')) out.push('smart-replies');
  if (resolveEnabled(flags, 'clip-slots')) out.push('clip-slots');
  if (resolveEnabled(flags, 'link-cleaner')) out.push('link-cleaner');
  return out;
}

export function sekmelerTabs(flags: unknown): SekmelerSubTab[] {
  const out: SekmelerSubTab[] = [];
  if (resolveEnabled(flags, 'life-browser')) out.push('oturumlar');
  if (resolveEnabled(flags, 'zombie-tabs') || resolveEnabled(flags, 'pinned-guard')) out.push('temizlik');
  if (
    resolveEnabled(flags, 'tab-labels') ||
    resolveEnabled(flags, 'tab-notes') ||
    resolveEnabled(flags, 'title-cleaner') ||
    resolveEnabled(flags, 'tab-switcher')
  ) {
    out.push('etiket-notlar');
  }
  if (resolveEnabled(flags, 'site-toolbar')) out.push('arac-cubugu');
  return out;
}

export function odakTabs(flags: unknown): OdakSubTab[] {
  const out: OdakSubTab[] = [];
  if (resolveEnabled(flags, 'site-blocker')) out.push('engelleyici');
  if (resolveEnabled(flags, 'time-tracker')) out.push('sureler');
  return out;
}

export function resolveActiveTab<T extends string>(current: T, enabledTabs: readonly T[], fallback: T): T {
  return enabledTabs.includes(current) ? current : (enabledTabs[0] ?? fallback);
}

/** Site araç çubuğu için yalnızca açık modüllerin (ve varsa sitede seçili) eylemlerini döndürür. */
export function filterToolbarActions<T extends { id: string; moduleId: string; toolbar?: boolean }>(
  actions: readonly T[],
  flags: unknown,
  siteActionIds?: readonly string[]
): T[] {
  const allowedSet = siteActionIds ? new Set(siteActionIds) : null;
  return actions.filter(
    action => Boolean(action.toolbar) && resolveEnabled(flags, action.moduleId) && (!allowedSet || allowedSet.has(action.id))
  );
}

export interface ModuleCategoryGroup<T> {
  id: string;
  label: string;
  icon: IconName;
  modules: T[];
}

/** Ayarlar › Araçlar görünümü için modülleri kategori başlıkları altında gruplar. */
export function groupModulesByCategory<T extends { id: string }>(
  allModules: readonly T[]
): ModuleCategoryGroup<T>[] {
  const byId = new Map(allModules.map(m => [m.id, m]));
  const used = new Set<string>();
  const result: ModuleCategoryGroup<T>[] = [];

  for (const group of groups) {
    if (!group.modules.length) continue;
    const mods: T[] = [];
    for (const id of group.modules) {
      const mod = byId.get(id);
      if (mod) {
        mods.push(mod);
        used.add(id);
      }
    }
    if (mods.length) {
      result.push({ id: group.id, label: group.label, icon: group.icon, modules: mods });
    }
  }

  const remaining = allModules.filter(m => !used.has(m.id));
  if (remaining.length) {
    result.push({ id: 'genel', label: 'Genel', icon: 'settings', modules: remaining });
  }

  return result;
}
