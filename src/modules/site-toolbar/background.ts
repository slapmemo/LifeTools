import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { listActions, toInfo, type ActionInfo, type ActionResult } from '../../core/actions';
import { runAction } from '../../core/action-runtime';
import { originOfUrl, replaceSiteScript } from '../../core/site-scripts';
import { normalizeToolbarSettings, TOOLBAR_SITES_KEY, type ToolbarSite } from './settings';

export const SITE_TOOLBAR_ID = 'site-toolbar';
export const TOOLBAR_CHANNEL = 'site-toolbar';
const SCRIPT = 'site-toolbar-content', SCRIPT_FILE = 'site-toolbar-content.js';

export interface ToolbarConfig { actions: ActionInfo[]; x?: number; y?: number }

/** Araç çubuğunda seçilebilen (sayfa bağlamlı) eylemlerin kimlikleri. */
export function toolbarActionIds(): string[] { return listActions().filter(a => a.toolbar).map(a => a.id); }

export async function loadToolbarSites(): Promise<ToolbarSite[]> {
  const data = await chrome.storage.local.get({ [TOOLBAR_SITES_KEY]: [] });
  return normalizeToolbarSettings(data[TOOLBAR_SITES_KEY], toolbarActionIds());
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = queue.then(task, task);
  queue = next.catch(() => undefined);
  return next;
}

function refresh(): void {
  void serial(async () => {
    if (!await isModuleEnabled(SITE_TOOLBAR_ID)) { await replaceSiteScript(SCRIPT, [], SCRIPT_FILE, false); return; }
    const sites = await loadToolbarSites();
    await replaceSiteScript(SCRIPT, sites.filter(s => s.actions.length).map(s => s.origin), SCRIPT_FILE, false);
  }).catch(err => { console.debug('[Site Araç Çubuğu]', err); });
}

/** Mesajı gönderen sayfanın sitesi ayarlıysa ve izin hâlâ varsa kaydını döndürür. */
async function siteFor(sender: chrome.runtime.MessageSender): Promise<ToolbarSite | null> {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab) return null;
  const origin = originOfUrl(sender.url);
  if (!origin || !await isModuleEnabled(SITE_TOOLBAR_ID)) return null;
  const site = (await loadToolbarSites()).find(s => s.origin === origin);
  if (!site || !site.actions.length || !await chrome.permissions.contains({ origins: [origin] })) return null;
  return site;
}

async function handle(msg: { action?: string; id?: unknown; x?: unknown; y?: unknown }, sender: chrome.runtime.MessageSender): Promise<ToolbarConfig | ActionResult | null> {
  const site = await siteFor(sender);
  if (!site) return null;
  if (msg.action === 'get') {
    const enabledIds = new Set(site.actions);
    return { actions: listActions().filter(a => a.toolbar && enabledIds.has(a.id)).map(toInfo), x: site.x, y: site.y };
  }
  if (msg.action === 'move' && typeof msg.x === 'number' && typeof msg.y === 'number') {
    await serial(async () => {
      const data = await chrome.storage.local.get({ [TOOLBAR_SITES_KEY]: [] });
      const sites = normalizeToolbarSettings(data[TOOLBAR_SITES_KEY], toolbarActionIds());
      const entry = sites.find(s => s.origin === site.origin);
      if (!entry) return;
      entry.x = Math.max(0, Math.min(1, msg.x as number)); entry.y = Math.max(0, Math.min(1, msg.y as number));
      await chrome.storage.local.set({ [TOOLBAR_SITES_KEY]: sites });
    });
    return { ok: true };
  }
  if (msg.action === 'run' && typeof msg.id === 'string') {
    if (!site.actions.includes(msg.id) || !listActions().some(a => a.id === msg.id && a.toolbar)) return { ok: false, message: 'Bu eylem bu sitede açık değil.' };
    return runAction(msg.id, undefined, sender.tab);
  }
  return null;
}

export function initSiteToolbarBackground(): void {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.channel !== TOOLBAR_CHANNEL) return false;
    handle(msg, sender).then(respond).catch(() => respond(null));
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[MODULE_FLAGS_KEY] || changes[TOOLBAR_SITES_KEY])) refresh(); });
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
}
