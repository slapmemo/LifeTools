import { registerContextMenuLoader, setContextMenuContributions, scheduleContextMenuRebuild, type ContextMenuContribution } from '../../core/context-menu';
import { backgroundDb, withExclusiveDb } from '../../db/host';
import { createSessionsRepo, HIDDEN_PREFIX } from '../life-browser/repo';
import { describeTabs } from '../life-browser/browser';
import { extensionBaseUrl } from '../../core/internal-tab';
import { openTabManager } from './open';
import { resolveShortcutTarget } from './logic';
import { buildTabMenuModel } from './menu-logic';
import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { PIN_MANAGER_KEY } from './settings';
import { migrateStoredSessions } from './workspace-migration';
import { appendToSavedGroup } from './saved-group-append';
import { TAB_MANAGER_ID } from './id';

const timers = new Map<number, ReturnType<typeof setTimeout>>();
let queue = Promise.resolve();

async function reconcile(windowId: number): Promise<void> {
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type !== 'normal' || win.incognito) return;
    const url = chrome.runtime.getURL('tabs.html');
    const tabs = (await chrome.tabs.query({ windowId })).filter(t => (t.url || t.pendingUrl) === url).sort((a, b) => a.index - b.index);
    const enabled = await isModuleEnabled(TAB_MANAGER_ID) && (await chrome.storage.local.get({ [PIN_MANAGER_KEY]: true }))[PIN_MANAGER_KEY] === true;
    if (!enabled) {
      const ids = tabs.flatMap(t => t.id === undefined ? [] : [t.id]);
      if (ids.length) await chrome.tabs.remove(ids);
      return;
    }
    const [first, ...duplicates] = tabs;
    const ids = duplicates.flatMap(t => t.id === undefined ? [] : [t.id]);
    if (ids.length) await chrome.tabs.remove(ids);
    if (!first) await chrome.tabs.create({ windowId, url, pinned: true, index: 0, active: false });
    else if (first.id !== undefined) {
      if (!first.pinned) await chrome.tabs.update(first.id, { pinned: true });
      if (first.index !== 0) await chrome.tabs.move(first.id, { index: 0 });
    }
  } catch { /* Window may have closed. */ }
}
function schedule(id: number): void {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => { timers.delete(id); queue = queue.then(() => reconcile(id)).catch(console.error); }, 1000));
}
function scheduleAll(): void {
  void chrome.windows.getAll({ windowTypes: ['normal'] }).then(wins => wins.forEach(w => { if (w.id !== undefined && !w.incognito) schedule(w.id); }));
}
const MENU = 'tab-manager:menu';
const menuRepo = createSessionsRepo(backgroundDb);
let menuTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleTabMenu(): void {
  clearTimeout(menuTimer);
  menuTimer = setTimeout(scheduleContextMenuRebuild, 300);
}
async function loadTabMenu(): Promise<void> {
  if (!await isModuleEnabled(TAB_MANAGER_ID)) { setContextMenuContributions(MENU, [], false); return; }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) { setContextMenuContributions(MENU, [], false); return; }
  const [groups, sessions, storage] = await Promise.all([chrome.tabGroups.query({ windowId: tab.windowId }), menuRepo.list(), chrome.storage.local.get("shortcutTargetGroup")]);
  const shortcut = resolveShortcutTarget(sessions, storage.shortcutTargetGroup);
  const model = buildTabMenuModel(groups, sessions, tab, extensionBaseUrl(), shortcut?.id);
  model.sessions.sort((a, b) => Number(b.id === shortcut?.id) - Number(a.id === shortcut?.id));
  for (const item of model.sessions) if (item.id === shortcut?.id) item.title += ' (kısayol)';
  const contexts = ['page', 'action'] as const;
  const items: ContextMenuContribution[] = [];
  const add = (id: string, title: string, parent?: string, onClick?: ContextMenuContribution['onClick'], extra: Partial<ContextMenuContribution> = {}): void => {
    items.push({ id: `${MENU}:${id}`, title, contexts, moduleId: TAB_MANAGER_ID, enabled: () => true, ...(parent ? { parent: `${MENU}:${parent}` } : {}), ...(onClick ? { onClick } : {}), ...extra });
  };
  const target = async (clicked?: chrome.tabs.Tab): Promise<chrome.tabs.Tab | undefined> => clicked?.id === undefined ? undefined : chrome.tabs.get(clicked.id);
  add('root', 'Sekmeyi grupla');
  for (const group of model.groups) add(`group:${group.id}`, `${group.current ? '✓ ' : ''}→ ${group.title}`, 'root', async (_info, clicked) => {
    const current = await target(clicked);
    if (current?.id !== undefined && current.windowId === tab.windowId && current.groupId !== group.id) await chrome.tabs.group({ groupId: group.id, tabIds: current.id });
  });
  add('new', 'Yeni grup oluştur', 'root', async (_info, clicked) => {
    const current = await target(clicked); if (current?.id === undefined) return;
    const title = buildTabMenuModel([], [], current, extensionBaseUrl()).site;
    const id = await chrome.tabs.group({ tabIds: current.id, createProperties: { windowId: current.windowId } });
    await chrome.tabGroups.update(id, { title });
  });
  add('ungroup', 'Gruptan çıkar', 'root', async (_info, clicked) => { const current = await target(clicked); if (current?.id !== undefined && current.groupId !== -1) await chrome.tabs.ungroup(current.id); }, { disabled: !model.grouped });
  if (model.sessions.length) {
    add('separator-saved', '', 'root', undefined, { type: 'separator' });
    add('saved', 'Kayda ekle ve kapat', 'root');
    for (const session of model.sessions) add(`session:${session.id}`, session.title, 'saved', async (_info, clicked) => {
      const current = await target(clicked); if (current?.id === undefined) return;
      if (!buildTabMenuModel([], [{ id: session.id, name: HIDDEN_PREFIX + 'x', created_at: 0, tab_count: 0 }], current, extensionBaseUrl()).sessions.length) return;
      const described = await describeTabs([{ ...current, url: current.url || current.pendingUrl }]);
      if (!described.length) return;
      const appended = await withExclusiveDb(async ex => {
        const repo = createSessionsRepo(ex);
        if (!(await repo.list()).some(item => item.id === session.id && item.name.startsWith(HIDDEN_PREFIX))) return false;
        await appendToSavedGroup(repo, session.id, described);
        return true;
      });
      if (!appended) return;
      await chrome.storage.local.set({ savedGroupsVersion: Date.now() });
      await chrome.tabs.remove(current.id);
      scheduleTabMenu();
    });
  }
  add('separator-open', '', 'root', undefined, { type: 'separator' });
  add('open', 'Sekme Yöneticisini aç', 'root', async (_info, clicked) => { await openTabManager(clicked?.windowId); });
  setContextMenuContributions(MENU, items, false);
}

export function initTabManagerBackground(): void {
  chrome.commands.onCommand.addListener(command => {
    if (command !== 'save-tab-to-group') return;
    void (async () => {
      const badge = async (text: string): Promise<void> => { await chrome.action.setBadgeText({ text }); setTimeout(() => { void chrome.action.setBadgeText({ text: '' }); }, 2000); };
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const url = tab?.url || tab?.pendingUrl || '';
        if (tab?.id === undefined || !/^https?:/i.test(url) || url.startsWith(extensionBaseUrl())) { await badge('!'); return; }
        const stored = await chrome.storage.local.get('shortcutTargetGroup');
        await withExclusiveDb(async ex => {
          const repo = createSessionsRepo(ex);
          const target = resolveShortcutTarget(await repo.list(), stored.shortcutTargetGroup);
          const input = { url, title: tab.title || null, pinned: false, group_title: 'Sonra', group_color: 'orange', note: null };
          if (target) await appendToSavedGroup(repo, target.id, [input]);
          else await repo.save(HIDDEN_PREFIX + 'Sonra', [input]);
        });
        await chrome.storage.local.set({ savedGroupsVersion: Date.now() });
        await chrome.tabs.remove(tab.id);
        await badge('✓');
      } catch { await badge('!'); }
    })();
  });
  registerContextMenuLoader(MENU, loadTabMenu);
  scheduleTabMenu();
  chrome.tabGroups.onCreated.addListener(scheduleTabMenu);
  chrome.tabGroups.onUpdated.addListener(scheduleTabMenu);
  chrome.tabGroups.onRemoved.addListener(scheduleTabMenu);
  chrome.tabs.onActivated.addListener(scheduleTabMenu);
  chrome.tabs.onUpdated.addListener((_id, change) => { if (change.groupId !== undefined || change.url !== undefined) scheduleTabMenu(); });
  chrome.windows.onFocusChanged.addListener(scheduleTabMenu);
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes.savedGroupsVersion || changes.shortcutTargetGroup)) scheduleTabMenu(); });
  void migrateStoredSessions();
  chrome.runtime.onStartup.addListener(() => { void migrateStoredSessions(); });
  chrome.runtime.onInstalled.addListener(() => { void migrateStoredSessions(); });
  chrome.runtime.onStartup.addListener(scheduleAll);
  chrome.runtime.onInstalled.addListener(scheduleAll);
  chrome.windows.onCreated.addListener(win => { if (win.id !== undefined && win.type === 'normal' && !win.incognito) schedule(win.id); });
  chrome.windows.onRemoved.addListener(id => { clearTimeout(timers.get(id)); timers.delete(id); });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PIN_MANAGER_KEY] || changes[MODULE_FLAGS_KEY])) scheduleAll(); });
}
