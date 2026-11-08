import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import { createTasksRepo, localToday } from './repo';
import { REMINDERS_KEY, reminderTime } from './reminders';

export const QUICK_TASKS_ID = 'quick-tasks';
const MENU = 'quick-tasks:add';
const repo = createTasksRepo(backgroundDb, Date.now, rescheduleTaskReminders);
const recent = new Map<number, number>();
const PREFIX = 'task-due:';
const FIRED_KEY = 'taskDueFired';
const SUMMARY_KEY = 'taskDueSummaryDay';
type Fired = Record<string, { due: string; snooze?: number }>;
let queue = Promise.resolve();
function enqueue(action: () => Promise<void>): void { queue = queue.then(action).catch(err => console.debug('[Görev hatırlatıcı]', err)); }
export function rescheduleTaskReminders(): void { enqueue(syncReminders); }

async function remindersEnabled(): Promise<boolean> {
  const data = await chrome.storage.local.get({ [REMINDERS_KEY]: false });
  return data[REMINDERS_KEY] === true && await isModuleEnabled(QUICK_TASKS_ID);
}

async function syncReminders(): Promise<void> {
  const alarms = (await chrome.alarms.getAll()).filter(a => a.name.startsWith(PREFIX));
  if (!(await remindersEnabled())) {
    await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)));
    return;
  }
  const tasks = await repo.listOpen();
  const data = await chrome.storage.local.get({ [FIRED_KEY]: {} });
  const fired = data[FIRED_KEY] as Fired;
  const now = Date.now();
  const valid = new Set(tasks.filter(t => t.due_date && fired[String(t.id)]?.due === t.due_date).map(t => String(t.id)));
  for (const id of Object.keys(fired)) if (!valid.has(id)) delete fired[id];
  await chrome.storage.local.set({ [FIRED_KEY]: fired });
  const candidates = tasks.flatMap(task => {
    const state = fired[String(task.id)];
    const prior = alarms.find(a => a.name === PREFIX + task.id);
    const when = state ? (state.snooze ? Math.max(state.snooze, now + 60_000) : null) : reminderTime(task.due_date, now);
    if (when === null || when === undefined) return [];
    return [{ task, when: !state && prior && prior.scheduledTime > now && task.due_date === localToday(now) && localToday(prior.scheduledTime) === task.due_date ? prior.scheduledTime : when }];
  }).sort((a, b) => a.when - b.when || a.task.id - b.task.id).slice(0, 50);
  await Promise.all(alarms.map(a => chrome.alarms.clear(a.name)));
  for (const { task, when } of candidates) await chrome.alarms.create(PREFIX + task.id, { when });
}

async function openTask(id: number) { return (await repo.listOpen()).find(task => task.id === id); }
function noticeId(id: string): number | null {
  if (!/^task-due:\d+$/.test(id)) return null;
  const value = Number(id.slice(PREFIX.length));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
async function dueAlarm(id: number): Promise<void> {
  if (!(await remindersEnabled())) return;
  const task = await openTask(id);
  if (!task?.due_date) { await syncReminders(); return; }
  const data = await chrome.storage.local.get({ [FIRED_KEY]: {} });
  const fired = data[FIRED_KEY] as Fired;
  fired[String(id)] = { due: task.due_date };
  await chrome.storage.local.set({ [FIRED_KEY]: fired });
  const label = task.due_date === localToday(Date.now()) ? 'Bugün' : `${task.due_date.slice(8, 10)}.${task.due_date.slice(5, 7)} 09:00`;
  await chrome.notifications.create(PREFIX + id, { type: 'basic', iconUrl: 'icons/icon128.png', title: task.title, message: `Son tarih: ${label}`, buttons: [{ title: 'Bitti' }, { title: '1 saat ertele' }] });
  await syncReminders();
}
async function startup(): Promise<void> {
  await syncReminders();
  if (!(await remindersEnabled())) return;
  const today = localToday(Date.now());
  const data = await chrome.storage.local.get({ [SUMMARY_KEY]: '' });
  if (data[SUMMARY_KEY] === today) return;
  const count = (await repo.listOpen()).filter(task => task.due_date && task.due_date < today).length;
  if (!count) return;
  await chrome.notifications.create('task-due-summary', { type: 'basic', iconUrl: 'icons/icon128.png', title: `${count} görevin süresi geçti`, message: 'Görevlerini görüntüle.' });
  await chrome.storage.local.set({ [SUMMARY_KEY]: today });
}
async function notificationClick(id: number, button?: number): Promise<void> {
  if (!(await remindersEnabled())) return;
  const task = await openTask(id);
  if (!task) return;
  if (button === 0) await repo.toggleDone(id);
  else if (button === 1 && task.due_date) {
    const data = await chrome.storage.local.get({ [FIRED_KEY]: {} });
    const fired = data[FIRED_KEY] as Fired;
    fired[String(id)] = { due: task.due_date, snooze: Date.now() + 60 * 60_000 };
    await chrome.storage.local.set({ [FIRED_KEY]: fired });
    await syncReminders();
  } else if (button === undefined) {
    let url = chrome.runtime.getURL('panel.html#gorevler');
    try { if (task.url && ['http:', 'https:'].includes(new URL(task.url).protocol)) url = task.url; } catch { /* Geçersiz bağlantıda panel açılır. */ }
    await chrome.tabs.create({ url });
  }
  await chrome.notifications.clear(PREFIX + id);
}

export function quickTasksMenuContributions(): ContextMenuContribution[] {
  return [
    {
      id: MENU,
      title: 'Görev olarak ekle',
      contexts: ['selection', 'page'],
      moduleId: QUICK_TASKS_ID,
      enabled: flags => resolveEnabled(flags, QUICK_TASKS_ID),
      onClick: async (info, tab) => {
        if (!(await isModuleEnabled(QUICK_TASKS_ID))) return;
        const url = info.linkUrl || info.pageUrl || tab?.url;
        const title = (info.selectionText?.trim() || info.linkUrl || tab?.title || url || '').slice(0, 300);
        try {
          await repo.add({ title, url });
          flashBadge('✓');
        } catch (err) {
          console.debug('[Hızlı Görevler] Kaydedilemedi:', err);
          flashBadge('!');
        }
      }
    }
  ];
}

export function initQuickTasksBackground(): void {
  setContextMenuContributions(QUICK_TASKS_ID, quickTasksMenuContributions());
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[REMINDERS_KEY] || changes[MODULE_FLAGS_KEY])) rescheduleTaskReminders(); });
  chrome.runtime.onStartup.addListener(() => enqueue(startup));
  chrome.runtime.onInstalled.addListener(rescheduleTaskReminders);
  chrome.alarms.onAlarm.addListener(alarm => { const id = noticeId(alarm.name); if (id !== null) enqueue(() => dueAlarm(id)); });
  chrome.notifications.onButtonClicked.addListener((name, button) => { const id = noticeId(name); if (id !== null) enqueue(() => notificationClick(id, button)); });
  chrome.notifications.onClicked.addListener(name => { const id = noticeId(name); if (id !== null) enqueue(() => notificationClick(id)); else if (name === 'task-due-summary') void chrome.tabs.create({ url: chrome.runtime.getURL('panel.html#gorevler') }); });
  rescheduleTaskReminders();
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type === 'quick-tasks:reschedule' && sender.id === chrome.runtime.id && !sender.tab) { rescheduleTaskReminders(); return; }
    if (!sender.tab || !['quick-tasks:add', 'quick-tasks:undo'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(QUICK_TASKS_ID))) return { ok: false };
        const now = Date.now();
        for (const [id, time] of recent) if (now - time > 120_000) recent.delete(id);
        if (msg.type === 'quick-tasks:add') {
          if (typeof msg.title !== 'string' || !msg.title.trim() || msg.title.length > 300 || typeof msg.url !== 'string' || msg.url.length > 10000) return { ok: false };
          const item = await repo.add({ title: msg.title, url: msg.url }); recent.set(item.id, Date.now());
          return { ok: true, id: item.id };
        }
        if (!Number.isSafeInteger(msg.id) || !recent.has(msg.id)) return { ok: false };
        recent.delete(msg.id); await repo.delete(msg.id); return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
