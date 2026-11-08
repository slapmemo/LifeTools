import { localToday, type Task } from './repo';

export const REMINDERS_KEY = 'taskDueReminders';

export function reminderTime(due: string | null, now: number): number | null {
  const match = due && /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(due);
  if (!due || !match || due.slice(0, 10) < localToday(now)) return null;
  const [, y, m, d, h, min] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  if (h !== undefined && (Number(h) > 23 || Number(min) > 59)) return null;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(h === undefined ? 9 : Number(h), min === undefined ? 0 : Number(min), 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const time = date.getTime();
  return time > now ? time : due.slice(0, 10) === localToday(now) ? now + 60_000 : null;
}

export function tasksToSchedule(tasks: Task[], now: number): { task: Task; when: number }[] {
  return tasks.flatMap(task => {
    const when = task.done_at === null ? reminderTime(task.due_date, now) : null;
    return when === null ? [] : [{ task, when }];
  }).sort((a, b) => a.when - b.when || a.task.id - b.task.id).slice(0, 50);
}
