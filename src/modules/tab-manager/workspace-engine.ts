import { extensionBaseUrl } from '../../core/internal-tab';
import { badge, bindingDecision, convertPlan, createWorkspace, deleteWorkspace, MAX_TABS, savedTabIds, shouldSaveSnapshot, snapshot, updateWorkspace, workspaceTabs, type Workspace } from './workspaces';

const KEY = 'workspaces', MODE = 'workspaceMode', MAP = 'windowWorkspace', LAST = 'lastWorkspaceId';
const locks = new Set<number>();
const closingWindows = new Set<number>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let queue: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
async function state(): Promise<{ items: Workspace[]; mode: 'groups' | 'workspaces'; map: Record<string, string> }> {
  const local = await chrome.storage.local.get({ [KEY]: [], [MODE]: 'workspaces', [LAST]: '' });
  let items = local[KEY] as Workspace[];
  if (!Array.isArray(items) || !items.length) { items = [createWorkspace([], 'Genel', 'grey', crypto.randomUUID())]; await chrome.storage.local.set({ [KEY]: items }); }
  const session = await chrome.storage.session.get({ [MAP]: {} });
  const map = session[MAP] as Record<string, string>;
  return { items, mode: local[MODE] === 'groups' ? 'groups' : 'workspaces', map };
}
async function assign(windowId: number, s: Awaited<ReturnType<typeof state>>): Promise<string> {
  if (s.items.some(w => w.id === s.map[windowId])) {
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (!wins.some(w => w.id !== undefined && w.id !== windowId && !w.incognito && s.map[w.id] === s.map[windowId])) return s.map[windowId];
    delete s.map[windowId];
  }
  const local = await chrome.storage.local.get(LAST), tabs = await chrome.tabs.query({ windowId });
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const decision = bindingDecision(s.items, local[LAST], s.map, wins.flatMap(w => w.id === undefined || w.incognito ? [] : [w.id]), windowId, tabs, extensionBaseUrl());
  let id = decision.id;
  if (!id) {
    let n = 1; while (s.items.some(w => w.name === `Pencere ${n}`)) n++;
    const w = createWorkspace(s.items, `Pencere ${n}`, 'grey', crypto.randomUUID());
    Object.assign(w, snapshot(tabs, extensionBaseUrl())); s.items.push(w); id = w.id;
    await chrome.storage.local.set({ [KEY]: s.items });
  }
  if (decision.restore) {
    const w = s.items.find(x => x.id === id)!;
    const created: number[] = [];
    try {
      for (const entry of w.tabs) { const t = await chrome.tabs.create({ windowId, url: entry.url, active: false }); if (t.id !== undefined) created.push(t.id); }
      if (!created.length) throw new Error('Sekmeler oluşturulamadı');
      await chrome.tabs.update(created[Math.min(w.activeIndex, created.length - 1)], { active: true });
      s.map[windowId] = id; await chrome.storage.session.set({ [MAP]: s.map });
    } catch (error) { await Promise.allSettled(created.map(tabId => chrome.tabs.remove(tabId))); throw error; }
  } else {
    if (decision.id && shouldSaveSnapshot(tabs, extensionBaseUrl(), closingWindows.has(windowId))) {
      Object.assign(s.items.find(w => w.id === id)!, snapshot(tabs, extensionBaseUrl()), { updatedAt: Date.now() });
      await chrome.storage.local.set({ [KEY]: s.items });
    }
    s.map[windowId] = id; await chrome.storage.session.set({ [MAP]: s.map });
  }
  return id;
}
async function normal(id: number): Promise<boolean> { const w = await chrome.windows.get(id); return w.type === 'normal' && !w.incognito; }
async function saveSnapshot(windowId: number, s: Awaited<ReturnType<typeof state>>): Promise<number[]> {
  if (s.mode !== 'workspaces' || closingWindows.has(windowId) || !await normal(windowId)) return [];
  const wasMapped = s.items.some(w => w.id === s.map[windowId]);
  const id = await assign(windowId, s);
  if (!wasMapped) return [];
  const tabs = await chrome.tabs.query({ windowId });
  const w = s.items.find(x => x.id === id)!;
  const ids = savedTabIds(tabs, extensionBaseUrl());
  if (!shouldSaveSnapshot(tabs, extensionBaseUrl(), closingWindows.has(windowId), w.tabs)) return [];
  Object.assign(w, snapshot(tabs, extensionBaseUrl()), { updatedAt: Date.now() });
  if (closingWindows.has(windowId)) return [];
  await chrome.storage.local.set({ [KEY]: s.items });
  return ids;
}
async function paint(windowId: number, s: Awaited<ReturnType<typeof state>>): Promise<void> {
  const tabs = await chrome.tabs.query({ windowId });
  const w = s.items.find(x => x.id === s.map[windowId]);
  await Promise.all(tabs.filter(t => t.id !== undefined).map(async t => {
    const tabId = t.id!; const b = w && s.mode === 'workspaces' ? badge(w) : undefined;
    await chrome.action.setBadgeText({ tabId, text: b?.text ?? '' });
    if (b) await chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
  }));
}
function schedule(windowId: number): void {
  if (locks.has(windowId) || closingWindows.has(windowId)) return;
  clearTimeout(timers.get(windowId));
  timers.set(windowId, setTimeout(() => { timers.delete(windowId); void serial(async () => { if (locks.has(windowId) || closingWindows.has(windowId)) return; const s = await state(); await saveSnapshot(windowId, s); if (!closingWindows.has(windowId)) await paint(windowId, s); }).catch(() => {}); }, 800));
}
async function switchTo(windowId: number, id: string, s: Awaited<ReturnType<typeof state>>, saved?: number[]): Promise<void> {
  if (s.mode !== 'workspaces' || !await normal(windowId)) throw new Error('Çalışma alanı modu etkin değil');
  const target = s.items.find(w => w.id === id); if (!target) throw new Error('Çalışma alanı bulunamadı');
  const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
  if (wins.some(w => w.id !== undefined && w.id !== windowId && !w.incognito && s.map[w.id] === id)) throw new Error('Çalışma alanı başka bir pencerede açık');
  if (saved === undefined && await assign(windowId, s) === id) { await paint(windowId, s); return; }
  locks.add(windowId); clearTimeout(timers.get(windowId)); timers.delete(windowId);
  const created: number[] = [];
  let oldTabsClosed = false;
  try {
    const old = saved ?? await saveSnapshot(windowId, s);
    const entries = target.tabs.length ? target.tabs : [{ url: 'chrome://newtab/', title: '' }];
    for (const entry of entries) { const tab = await chrome.tabs.create({ windowId, url: entry.url, active: false }); if (tab.id !== undefined) created.push(tab.id); }
    if (!created.length) throw new Error('Sekmeler oluşturulamadı');
    const active = created[Math.min(Math.max(0, target.activeIndex), created.length - 1)];
    await chrome.tabs.update(active, { active: true });
    await chrome.storage.local.set({ [LAST]: id }); s.map[windowId] = id; await chrome.storage.session.set({ [MAP]: s.map });
    oldTabsClosed = true;
    await Promise.allSettled(old.map(tabId => chrome.tabs.remove(tabId)));
    await paint(windowId, s);
  } catch (error) { if (!oldTabsClosed && created.length) await chrome.tabs.remove(created).catch(() => {}); throw error; }
  finally { locks.delete(windowId); }
}
async function handle(message: Record<string, unknown>): Promise<Record<string, unknown>> {
  const s = await state(); const type = message.type;
  const id = typeof message.id === 'string' ? message.id : '';
  if (type === 'ws:list') return { mode: s.mode, workspaces: s.items.map(w => ({ ...w, count: w.tabs.length })), activeByWindow: s.map };
  if (type === 'ws:set-mode') {
    if (message.mode !== 'groups' && message.mode !== 'workspaces') throw new Error('Geçersiz mod');
    s.mode = message.mode; await chrome.storage.local.set({ [MODE]: s.mode });
    for (const win of await chrome.windows.getAll({ windowTypes: ['normal'] })) if (win.id !== undefined && !win.incognito) { if (s.mode === 'workspaces') await saveSnapshot(win.id, s); await paint(win.id, s); }
    return {};
  }
  if (s.mode !== 'workspaces') throw new Error('Çalışma alanı modu etkin değil');
  if (type === 'ws:create') { const w = createWorkspace(s.items, message.name, message.color, crypto.randomUUID()); s.items.push(w); await chrome.storage.local.set({ [KEY]: s.items }); return { id: w.id }; }
  if (type === 'ws:update') { const index = s.items.findIndex(w => w.id === id); if (index < 0) throw new Error('Çalışma alanı bulunamadı'); s.items[index] = updateWorkspace(s.items[index], message.name, message.color); await chrome.storage.local.set({ [KEY]: s.items }); for (const key of Object.keys(s.map)) if (s.map[key] === id) await paint(Number(key), s).catch(() => {}); return {}; }
  if (type === 'ws:switch' || type === 'ws:convert-groups') {
    if (!Number.isInteger(message.windowId) || (message.windowId as number) < 0) throw new Error('Geçersiz pencere');
    const windowId = message.windowId as number;
    if (type === 'ws:switch') { await switchTo(windowId, id, s); return {}; }
    if (!await normal(windowId)) throw new Error('Geçersiz pencere');
    const plan = convertPlan(await chrome.tabs.query({ windowId }), await chrome.tabGroups.query({ windowId }), extensionBaseUrl());
    if (s.items.length + plan.length > 30 || plan.some(p => p.tabs.length > MAX_TABS)) throw new Error('Sınır aşıldı');
    locks.add(windowId);
    try { for (const p of plan) { const w = createWorkspace(s.items, p.name, p.color, crypto.randomUUID()); Object.assign(w, snapshot(p.tabs, extensionBaseUrl())); s.items.push(w); } await chrome.storage.local.set({ [KEY]: s.items }); const ids = plan.flatMap(p => p.tabs.flatMap(t => t.id === undefined ? [] : [t.id])); if (ids.length) { const all = await chrome.tabs.query({ windowId }); if (all.length === ids.length) await chrome.tabs.create({ windowId, active: false }); await chrome.tabs.remove(ids); } await saveSnapshot(windowId, s); } finally { locks.delete(windowId); }
    return {};
  }
  if (type === 'ws:delete') {
    const moveTo = message.moveTo; if (moveTo !== undefined && typeof moveTo !== 'string') throw new Error('Geçersiz hedef');
    deleteWorkspace(s.items, id, moveTo as string | undefined);
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const open = wins.flatMap(w => w.id === undefined || w.incognito ? [] : [w.id]);
    const sourceWindows = open.filter(n => s.map[n] === id);
    const fallback = (moveTo as string | undefined) ?? s.items.find(w => w.id !== id)!.id;
    if (open.some(n => s.map[n] === fallback)) throw new Error('Hedef çalışma alanı başka bir pencerede açık');
    const saved = new Map<number, number[]>();
    for (const n of sourceWindows) saved.set(n, await saveSnapshot(n, s));
    const remaining = deleteWorkspace(s.items, id, moveTo as string | undefined);
    if (moveTo !== undefined) { s.items = remaining; await chrome.storage.local.set({ [KEY]: s.items }); }
    for (const n of sourceWindows) await switchTo(n, fallback, s, saved.get(n));
    if (moveTo === undefined) { s.items = remaining; await chrome.storage.local.set({ [KEY]: s.items }); }
    for (const key of Object.keys(s.map)) if (s.map[key] === id) delete s.map[key];
    await chrome.storage.session.set({ [MAP]: s.map }); return {};
  }
  if (type === 'ws:move-tabs') {
    if (!Array.isArray(message.tabIds) || !message.tabIds.length || !message.tabIds.every(n => Number.isInteger(n) && n >= 0) || new Set(message.tabIds).size !== message.tabIds.length) throw new Error('Geçersiz sekmeler');
    const target = s.items.find(w => w.id === id); if (!target) throw new Error('Çalışma alanı bulunamadı');
    const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (wins.some(w => w.id !== undefined && !w.incognito && s.map[w.id] === id)) throw new Error('Hedef çalışma alanı başka bir pencerede açık');
    const tabs = await Promise.all((message.tabIds as number[]).map(n => chrome.tabs.get(n))); if (tabs.some(t => !workspaceTabs([t], extensionBaseUrl()).length || t.incognito)) throw new Error('Geçersiz sekmeler');
    for (const windowId of new Set(tabs.map(t => t.windowId))) { if (!await normal(windowId)) throw new Error('Geçersiz pencere'); await saveSnapshot(windowId, s); if (s.map[windowId] === id) throw new Error('Sekmeler zaten bu çalışma alanında'); }
    if (target.tabs.length + tabs.length > MAX_TABS) throw new Error('Sekme sınırı aşıldı');
    target.tabs.push(...snapshot(tabs, extensionBaseUrl()).tabs); target.updatedAt = Date.now(); await chrome.storage.local.set({ [KEY]: s.items });
    for (const windowId of new Set(tabs.map(t => t.windowId))) { const all = await chrome.tabs.query({ windowId }); if (all.every(t => t.id !== undefined && (message.tabIds as number[]).includes(t.id))) await chrome.tabs.create({ windowId, active: false }); }
    await Promise.allSettled((message.tabIds as number[]).map(tabId => chrome.tabs.remove(tabId))); return {};
  }
  throw new Error('Bilinmeyen işlem');
}
export function initWorkspaceEngine(): void {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string' || !message.type.startsWith('ws:')) return;
    if (!(sender.id === chrome.runtime.id && (!sender.tab || sender.url?.startsWith(extensionBaseUrl())))) { respond({ ok: false, error: 'Yetkisiz istek' }); return; }
    void serial(() => handle(message)).then(result => respond({ ok: true, ...result }), error => respond({ ok: false, error: String(error instanceof Error ? error.message : error) })); return true;
  });
  chrome.tabs.onCreated.addListener(t => schedule(t.windowId));
  const markClosing = (id: number): void => { closingWindows.add(id); clearTimeout(timers.get(id)); timers.delete(id); };
  chrome.tabs.onRemoved.addListener((_id, info) => { if (info.isWindowClosing) markClosing(info.windowId); else schedule(info.windowId); });
  chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (change.url !== undefined || change.title !== undefined || change.pinned !== undefined) schedule(tab.windowId); });
  chrome.tabs.onMoved.addListener((_id, info) => schedule(info.windowId)); chrome.tabs.onAttached.addListener((_id, info) => schedule(info.newWindowId)); chrome.tabs.onDetached.addListener((_id, info) => schedule(info.oldWindowId)); chrome.tabs.onActivated.addListener(info => schedule(info.windowId));
  chrome.windows.onCreated.addListener(w => { if (w.id !== undefined && w.type === 'normal' && !w.incognito) { closingWindows.delete(w.id); schedule(w.id); } });
  chrome.windows.onRemoved.addListener(id => { markClosing(id); void serial(async () => { const s = await state(); delete s.map[id]; await chrome.storage.session.set({ [MAP]: s.map }); }); });
  const seed = (): void => { void chrome.windows.getAll({ windowTypes: ['normal'] }).then(wins => wins.forEach(w => { if (w.id !== undefined && !w.incognito) schedule(w.id); })); }; seed(); chrome.runtime.onStartup.addListener(seed);
}
