import type { SessionsRepo, SessionTab } from './repo';
import { isGroupColor, planGroupsBySite, toSessionTabs, type GroupInfo, type SessionTabInput } from './tabs';

const NO_GROUP = -1;

/** Sekmeleri, Chrome sekme grubu başlık/renk bilgisiyle birlikte oturum kaydına çevirir. */
export async function describeTabs(tabs: chrome.tabs.Tab[]): Promise<SessionTabInput[]> {
  const groups = new Map<number, GroupInfo>();
  const ids = new Set(tabs.map(tab => tab.groupId).filter(id => id !== undefined && id !== NO_GROUP));
  for (const id of ids) {
    try { const group = await chrome.tabGroups.get(id); groups.set(id, { title: group.title ?? '', color: group.color ?? null }); }
    catch { /* Grup bu arada kapanmış olabilir. */ }
  }
  return toSessionTabs(tabs, groups);
}

/** Verilen sekmeleri yeni bir oturuma kaydeder ve kapatır. */
export async function moveTabsToSession(repo: SessionsRepo, name: string, tabs: chrome.tabs.Tab[]): Promise<number> {
  const id = await repo.save(name, await describeTabs(tabs));
  const tabIds = tabs.map(tab => tab.id).filter((tabId): tabId is number => tabId !== undefined);
  if (tabIds.length) await chrome.tabs.remove(tabIds);
  return id;
}

/** Pencereyi kapatır; son normal pencere ise Chrome kapanmasın diye önce yeni bir pencere açar. */
export async function closeWindowSafely(windowId: number): Promise<void> {
  const others = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter(win => win.id !== windowId);
  if (!others.length) await chrome.windows.create({ focused: true });
  await chrome.windows.remove(windowId);
}

/** Penceredeki gruplanmamış sekmeleri siteye göre Chrome sekme gruplarına toplar; oluşturulan grup sayısını döndürür. */
export async function groupWindowBySite(windowId: number): Promise<number> {
  const plans = planGroupsBySite(await chrome.tabs.query({ windowId }));
  for (const plan of plans) {
    const groupId = await chrome.tabs.group({ tabIds: plan.tabIds as [number, ...number[]], createProperties: { windowId } });
    await chrome.tabGroups.update(groupId, { title: plan.site });
  }
  return plans.length;
}

/** Kayıtlı oturumu yeni pencerede açar; sabit sekmeleri ve sekme gruplarını geri kurar. */
export async function openSession(tabs: readonly SessionTab[]): Promise<void> {
  if (!tabs.length) throw new Error('Bu oturumda sekme yok.');
  const win = await chrome.windows.create({ url: tabs.map(tab => tab.url), focused: true });
  const windowId = win?.id;
  const created = win?.tabs ?? [];
  if (windowId === undefined) return;
  for (let i = 0; i < tabs.length; i++) {
    const id = created[i]?.id;
    if (tabs[i].pinned && id !== undefined) await chrome.tabs.update(id, { pinned: true });
  }
  // Aynı başlık/renge sahip ardışık sekmeler tek grup olarak geri kurulur (sabit sekmeler gruplanamaz).
  let i = 0;
  while (i < tabs.length) {
    const first = tabs[i];
    if (first.group_title === null || first.pinned) { i++; continue; }
    const ids: number[] = [];
    let j = i;
    while (j < tabs.length && !tabs[j].pinned && tabs[j].group_title === first.group_title && tabs[j].group_color === first.group_color) {
      const id = created[j]?.id;
      if (id !== undefined) ids.push(id);
      j++;
    }
    if (ids.length) {
      const groupId = await chrome.tabs.group({ tabIds: ids as [number, ...number[]], createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, isGroupColor(first.group_color)
        ? { title: first.group_title, color: first.group_color as chrome.tabGroups.ColorEnum }
        : { title: first.group_title });
    }
    i = j;
  }
}
