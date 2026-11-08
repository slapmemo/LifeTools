import { MODULE_FLAGS_KEY, resolveEnabled } from './module-state';

export const CONTEXT_MENU_ROOT_ID = 'lifetools';
export const CONTEXT_MENU_ROOT_TITLE = 'LifeTools';

export type MenuContext = 'selection' | 'editable' | 'link' | 'page';

export interface ContextMenuContribution {
  id: string;
  title: string;
  contexts: readonly MenuContext[];
  targetUrlPatterns?: readonly string[];
  parent?: string;
  moduleId?: string;
  enabled: (flags?: unknown) => boolean;
  onClick?: (info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void | Promise<void>;
}

export interface ContextMenuItemSpec {
  id: string;
  title: string;
  parentId?: string;
  contexts: MenuContext[];
  targetUrlPatterns?: string[];
}

const CANONICAL_CONTEXT_ORDER: readonly MenuContext[] = ['selection', 'editable', 'link', 'page'];

const CANONICAL_TOP_ORDER: readonly string[] = [
  'slapmemo',
  'quick-tasks:add',
  'clip:save',
  'smart-replies-root',
  'clip:paste',
  'link-cleaner:link',
  'link-cleaner:page',
  'watchlist:add',
  'tab-labels-menu'
];

export function inferModuleId(id: string, parent?: string): string | undefined {
  const key = parent ?? id;
  if (key === 'slapmemo' || key.startsWith('slapmemo:')) return 'slapmemo';
  if (key.startsWith('quick-tasks:')) return 'quick-tasks';
  if (key.startsWith('clip:')) return 'clip-slots';
  if (key === 'smart-replies-root' || key.startsWith('smart-replies:')) return 'smart-replies';
  if (key.startsWith('link-cleaner:')) return 'link-cleaner';
  if (key.startsWith('watchlist:')) return 'watchlist';
  if (key === 'tab-labels-menu' || key.startsWith('tab-labels-menu:')) return 'tab-labels';
  return undefined;
}

function isItemEnabled(item: ContextMenuContribution, flags?: unknown): boolean {
  const moduleId = item.moduleId ?? inferModuleId(item.id, item.parent);
  if (moduleId && !resolveEnabled(flags, moduleId)) return false;
  if (!resolveEnabled(flags, item.id)) return false;
  return item.enabled ? Boolean(item.enabled(flags)) : true;
}

function topOrderRank(id: string, fallbackIndex: number): number {
  const idx = CANONICAL_TOP_ORDER.indexOf(id);
  return idx >= 0 ? idx : CANONICAL_TOP_ORDER.length + fallbackIndex;
}

/**
 * Saf ağaç kurucu: modül katkılarından ve etkin bayraklarından Chrome sağ tık menüsü öğe listesini üretir.
 * Etkin öğe yoksa boş dizi döner; varsa ilk öğe tek kök olan "LifeTools" menüsüdür.
 */
export function buildContextMenuTree(
  contributions: readonly ContextMenuContribution[],
  flags?: unknown
): ContextMenuItemSpec[] {
  const topLevel = contributions
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.parent && isItemEnabled(item, flags))
    .sort((a, b) => topOrderRank(a.item.id, a.index) - topOrderRank(b.item.id, b.index))
    .map(({ item }) => item);

  if (topLevel.length === 0) return [];

  const enabledTopIds = new Set(topLevel.map(item => item.id));
  const childrenByParent = new Map<string, ContextMenuContribution[]>();

  for (const item of contributions) {
    if (!item.parent || !enabledTopIds.has(item.parent)) continue;
    if (!isItemEnabled(item, flags)) continue;
    const list = childrenByParent.get(item.parent) ?? [];
    list.push(item);
    childrenByParent.set(item.parent, list);
  }

  // Alt öğesi tanımlanmış ancak hiçbir alt öğesi etkin olmayan kapsayıcıları gizle
  const parentsWithDefinedChildren = new Set(
    contributions.filter(item => Boolean(item.parent)).map(item => item.parent as string)
  );
  const activeTopLevel = topLevel.filter(
    item => !parentsWithDefinedChildren.has(item.id) || (childrenByParent.get(item.id)?.length ?? 0) > 0
  );

  if (activeTopLevel.length === 0) return [];

  const rootContextSet = new Set<MenuContext>();
  for (const item of activeTopLevel) {
    for (const ctx of item.contexts) rootContextSet.add(ctx);
  }
  const rootContexts = CANONICAL_CONTEXT_ORDER.filter(ctx => rootContextSet.has(ctx));
  const finalRootContexts: MenuContext[] =
    rootContexts.length > 0 ? rootContexts : [...activeTopLevel[0].contexts];

  const result: ContextMenuItemSpec[] = [
    {
      id: CONTEXT_MENU_ROOT_ID,
      title: CONTEXT_MENU_ROOT_TITLE,
      contexts: finalRootContexts
    }
  ];

  for (const top of activeTopLevel) {
    result.push({
      id: top.id,
      title: top.title,
      parentId: CONTEXT_MENU_ROOT_ID,
      contexts: [...top.contexts],
      ...(top.targetUrlPatterns ? { targetUrlPatterns: [...top.targetUrlPatterns] } : {})
    });
    const children = childrenByParent.get(top.id) ?? [];
    for (const child of children) {
      result.push({
        id: child.id,
        title: child.title,
        parentId: top.id,
        contexts: [...child.contexts],
        ...(child.targetUrlPatterns ? { targetUrlPatterns: [...child.targetUrlPatterns] } : {})
      });
    }
  }

  return result;
}

/** Belirli bir sağ tık bağlamında ('selection' | 'editable' | 'link' | 'page') görünen üst düzey menü öğelerini döndürür. */
export function visibleTopItemsForContext(
  tree: readonly ContextMenuItemSpec[],
  context: MenuContext
): ContextMenuItemSpec[] {
  return tree.filter(item => item.parentId === CONTEXT_MENU_ROOT_ID && item.contexts.includes(context));
}

const sourceContributions = new Map<string, ContextMenuContribution[]>();
const refreshLoaders = new Map<string, () => Promise<void> | void>();

const REBUILD_DEBOUNCE_MS = 15;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let rebuildQueue: Promise<void> = Promise.resolve();
let listenersBound = false;

export function listContextMenuContributions(): ContextMenuContribution[] {
  const all: ContextMenuContribution[] = [];
  for (const items of sourceContributions.values()) {
    all.push(...items);
  }
  return all;
}

export function clearContextMenuContributions(): void {
  sourceContributions.clear();
  refreshLoaders.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}

/** Modülün sağ tık menüsü öğelerini kaydeder/günceller ve ağacı yeniden kurmak üzere zamanlar. */
export function setContextMenuContributions(
  sourceId: string,
  items: readonly ContextMenuContribution[]
): void {
  sourceContributions.set(sourceId, [...items]);
  ensureContextMenuListeners();
  scheduleContextMenuRebuild();
}

/** Tekil öğe katkısı ekler veya günceller. */
export function contributeContextMenuItem(item: ContextMenuContribution): void {
  const sourceId = item.moduleId ?? inferModuleId(item.id, item.parent) ?? item.id;
  const existing = (sourceContributions.get(sourceId) ?? []).filter(entry => entry.id !== item.id);
  existing.push(item);
  sourceContributions.set(sourceId, existing);
  ensureContextMenuListeners();
  scheduleContextMenuRebuild();
}

/** Yeniden kurulum öncesinde dinamik alt öğeleri (şablonlar, pano yuvaları vb.) tazeleyen kanca kaydeder. */
export function registerContextMenuLoader(
  sourceId: string,
  loader: () => Promise<void> | void
): void {
  refreshLoaders.set(sourceId, loader);
  ensureContextMenuListeners();
}

function removeAllMenus(): Promise<void> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.contextMenus?.removeAll) {
      resolve();
      return;
    }
    chrome.contextMenus.removeAll(() => {
      void chrome.runtime?.lastError;
      resolve();
    });
  });
}

function createMenuItem(spec: ContextMenuItemSpec): Promise<void> {
  return new Promise(resolve => {
    if (typeof chrome === 'undefined' || !chrome.contextMenus?.create) {
      resolve();
      return;
    }
    const props: chrome.contextMenus.CreateProperties = {
      id: spec.id,
      title: spec.title,
      contexts: spec.contexts as [chrome.contextMenus.ContextType, ...chrome.contextMenus.ContextType[]],
      ...(spec.targetUrlPatterns ? { targetUrlPatterns: spec.targetUrlPatterns } : {}),
      ...(spec.parentId ? { parentId: spec.parentId } : {})
    };
    chrome.contextMenus.create(props, () => {
      void chrome.runtime?.lastError;
      resolve();
    });
  });
}

async function performRebuild(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  for (const loader of refreshLoaders.values()) {
    try {
      await loader();
    } catch (err) {
      console.debug('[Sağ Tık Menüsü] Yükleyici hatası:', err);
    }
  }
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} });
  const flags = data[MODULE_FLAGS_KEY];
  const tree = buildContextMenuTree(listContextMenuContributions(), flags);
  await removeAllMenus();
  for (const item of tree) {
    await createMenuItem(item);
  }
}

/** Sağ tık menüsü ağacını hemen (sıraya alarak) yeniden kurar. */
export function rebuildContextMenuNow(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  rebuildQueue = rebuildQueue.then(performRebuild).catch(err => {
    console.debug('[Sağ Tık Menüsü] Kurulum hatası:', err);
  });
  return rebuildQueue;
}

/** Sağ tık menüsü ağacını kısa gecikmeyle (debounced) yeniden kurar. */
export function scheduleContextMenuRebuild(): void {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined;
    void rebuildContextMenuNow();
  }, REBUILD_DEBOUNCE_MS);
}

async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
): Promise<void> {
  const id = String(info.menuItemId);
  const item = listContextMenuContributions().find(entry => entry.id === id);
  if (!item?.onClick) return;
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} });
  if (!isItemEnabled(item, data[MODULE_FLAGS_KEY])) return;
  await item.onClick(info, tab);
}

export function ensureContextMenuListeners(): void {
  if (listenersBound || typeof chrome === 'undefined' || !chrome.contextMenus) return;
  listenersBound = true;

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab).catch(err => {
      console.debug('[Sağ Tık Menüsü] Tıklama hatası:', err);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MODULE_FLAGS_KEY]) {
      scheduleContextMenuRebuild();
    }
  });

  chrome.runtime.onInstalled.addListener(() => {
    scheduleContextMenuRebuild();
  });

  chrome.runtime.onStartup.addListener(() => {
    scheduleContextMenuRebuild();
  });
}

export function initContextMenuBackground(): void {
  ensureContextMenuListeners();
  scheduleContextMenuRebuild();
}
