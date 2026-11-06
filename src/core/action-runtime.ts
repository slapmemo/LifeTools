import { flashBadge } from './badge';
import { ACTIONS_CHANNEL, filterEnabled, getAction, listActions, toInfo, type ActionInfo, type ActionResult } from './actions';
import { isModuleEnabled, MODULE_FLAGS_KEY } from './module-state';

/** Son odaklı normal pencerenin etkin sekmesi. */
export async function getTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (win.type === 'normal' && win.id !== undefined) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tab) return tab;
    }
  } catch { /* Aşağıdaki yedek yola düş. */ }
  try {
    for (const win of await chrome.windows.getAll({ windowTypes: ['normal'] })) {
      if (win.id === undefined) continue;
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tab) return tab;
    }
  } catch { /* Sekme yok. */ }
  return undefined;
}

/** Eylemi çalıştırır; kapalı modül, eksik argüman ve hataları ActionResult olarak döndürür. */
export async function runAction(id: string, arg?: string, tab?: chrome.tabs.Tab): Promise<ActionResult> {
  const action = getAction(id);
  if (!action) return { ok: false, message: 'Eylem bulunamadı.' };
  if (!(await isModuleEnabled(action.moduleId))) return { ok: false, message: 'Bu araç kapalı.' };
  const text = arg?.trim();
  if (action.takesArg && !text) return { ok: false, message: 'Bir metin yazmalısın.' };
  try {
    const message = await action.run({ tab: tab ?? (await getTargetTab()), arg: text || undefined });
    flashBadge('✓');
    return { ok: true, message: message || undefined };
  } catch (err) {
    console.debug('[Eylem]', id, err);
    flashBadge('!');
    return { ok: false, message: err instanceof Error ? err.message : 'İşlem başarısız.' };
  }
}

export async function listEnabledActions(): Promise<ActionInfo[]> {
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} });
  return filterEnabled(listActions(), data[MODULE_FLAGS_KEY]).map(toInfo);
}

/** Yalnızca uzantı sayfalarından gelen istekleri karşılar (içerik betikleri kendi kanallarını kullanır). */
export function registerActionBridge(): void {
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!msg || msg.channel !== ACTIONS_CHANNEL) return false;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, message: 'İzin yok.' }); return false; }
    void (async () => {
      if (msg.action === 'list') return listEnabledActions();
      if (msg.action === 'listAll') return listActions().map(toInfo);
      if (msg.action === 'run' && typeof msg.id === 'string') {
        const tab = typeof msg.tabId === 'number' ? await chrome.tabs.get(msg.tabId).catch(() => undefined) : undefined;
        return runAction(msg.id, typeof msg.arg === 'string' ? msg.arg : undefined, tab);
      }
      return { ok: false, message: 'Bilinmeyen istek.' };
    })().then(respond).catch(() => respond({ ok: false, message: 'İşlem başarısız.' }));
    return true;
  });
}
