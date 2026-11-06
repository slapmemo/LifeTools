import { resolveEnabled } from './module-state';

/** Eylem kaydı: modüller kullanıcıya açık eylemleri buraya bildirir. Bu dosya chrome API'si gerektirmeyen saf mantıktır. */
export const ACTIONS_CHANNEL = 'lifetools:actions';

export interface ActionContext {
  /** Hedef sekme: son odaklı normal pencerenin etkin sekmesi (veya çağıranın sekmesi). */
  tab?: chrome.tabs.Tab;
  /** Metin argümanı (ör. "Not ekle: <metin>"). */
  arg?: string;
}

export interface LifeAction {
  id: string;
  /** Türkçe başlık. */
  title: string;
  keywords: readonly string[];
  moduleId: string;
  /** true ise eylem bir metin argümanı ister. */
  takesArg?: boolean;
  /** Komut merkezinde argümanlı eylem seçilince girişe yazılan önek (ör. "not "). */
  argPrefix?: string;
  /** true ise sayfa bağlamında anlamlıdır; site araç çubuğunda seçilebilir. */
  toolbar?: boolean;
  run(ctx: ActionContext): Promise<string | void> | string | void;
}

export type ActionInfo = Omit<LifeAction, 'run'>;
export interface ActionResult { ok: boolean; message?: string }

const registry = new Map<string, LifeAction>();

export function registerAction(action: LifeAction): void {
  if (!/^[a-z0-9]+(\.[a-zA-Z0-9]+)+$/.test(action.id)) throw new Error(`Geçersiz eylem kimliği: ${action.id}`);
  if (registry.has(action.id)) throw new Error(`Eylem zaten kayıtlı: ${action.id}`);
  registry.set(action.id, action);
}

export function getAction(id: string): LifeAction | undefined { return registry.get(id); }
export function listActions(): LifeAction[] { return [...registry.values()]; }
export function clearActions(): void { registry.clear(); }

/** Kapalı modüllerin eylemlerini gizler (`flags`: moduleEnabled kaydı; kayıt yoksa modül açık sayılır). */
export function filterEnabled<T extends { moduleId: string }>(actions: readonly T[], flags: unknown): T[] {
  return actions.filter(action => resolveEnabled(flags, action.moduleId));
}

export function toInfo(action: LifeAction): ActionInfo {
  const { run: _run, ...info } = action;
  void _run;
  return info;
}

/** "Not ekle: merhaba dünya" -> { head: "Not ekle", arg: "merhaba dünya" }. İki nokta yoksa arg boştur. */
export function splitArg(input: string): { head: string; arg: string } {
  const index = input.indexOf(':');
  if (index < 0) return { head: input.trim(), arg: '' };
  return { head: input.slice(0, index).trim(), arg: input.slice(index + 1).trim() };
}

/** Pencere/sayfa bağlamından (popup, komut merkezi, içerik betiği) arka plana eylem çalıştırma isteği. */
export async function requestRunAction(id: string, arg?: string, tabId?: number): Promise<ActionResult> {
  try {
    const res = (await chrome.runtime.sendMessage({ channel: ACTIONS_CHANNEL, action: 'run', id, arg, tabId })) as ActionResult | undefined;
    return res ?? { ok: false, message: 'Arka plan yanıt vermedi.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'İşlem başarısız.' };
  }
}

/** Etkin modüllerin eylemlerinin bilgisini ister (uzantı sayfaları için). */
export async function requestActions(): Promise<ActionInfo[]> {
  try {
    const res = (await chrome.runtime.sendMessage({ channel: ACTIONS_CHANNEL, action: 'list' })) as ActionInfo[] | undefined;
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}

/** Tüm eylemlerin (kapalı olanlar dahil) bilgisini ister; araç çubuğu ayarları için. */
export async function requestAllActions(): Promise<ActionInfo[]> {
  try {
    const res = (await chrome.runtime.sendMessage({ channel: ACTIONS_CHANNEL, action: 'listAll' })) as ActionInfo[] | undefined;
    return Array.isArray(res) ? res : [];
  } catch { return []; }
}
