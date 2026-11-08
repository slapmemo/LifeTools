import { localToday, type Task } from './repo';

export const REMINDERS_KEY = 'taskDueReminders';

export function reminderTime(due: string | null, now: number): number | null {
  if (!due || !/^\d{4}-\d{2}-\d{2}$/.test(due) || due < localToday(now)) return null;
  const [year, month, day] = due.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(9, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const time = date.getTime();
  return time > now ? time : due === localToday(now) ? now + 60_000 : null;
}

export function tasksToSchedule(tasks: Task[], now: number): { task: Task; when: number }[] {
  return tasks.flatMap(task => {
    const when = task.done_at === null ? reminderTime(task.due_date, now) : null;
    return when === null ? [] : [{ task, when }];
  }).sort((a, b) => a.when - b.when || a.task.id - b.task.id).slice(0, 50);
}
