import { expect, test } from 'vitest';
import { reminderTime, tasksToSchedule } from '../src/modules/quick-tasks/reminders';
import type { Task } from '../src/modules/quick-tasks/repo';

test('yerel tarih için 09:00 veya bugün geçmişse bir dakika sonrası seçilir', () => {
  const morning = new Date(2026, 10, 8, 8).getTime();
  const noon = new Date(2026, 10, 8, 12).getTime();
  expect(reminderTime('2026-11-08', morning)).toBe(new Date(2026, 10, 8, 9).getTime());
  expect(reminderTime('2026-11-08', noon)).toBe(noon + 60_000);
  expect(reminderTime('2026-11-09', noon)).toBe(new Date(2026, 10, 9, 9).getTime());
  expect(reminderTime('2026-11-09 15:30', noon)).toBe(new Date(2026, 10, 9, 15, 30).getTime());
  expect(reminderTime('2026-11-09 25:00', noon)).toBeNull();
  expect(reminderTime('2026-11-07', noon)).toBeNull();
  expect(reminderTime('2026-02-30', noon)).toBeNull();
  expect(reminderTime(null, noon)).toBeNull();
});

test('yalnızca açık ve tarihli en yakın 50 görev seçilir', () => {
  const now = new Date(2026, 10, 8, 8).getTime();
  const tasks = Array.from({ length: 55 }, (_, i) => ({ id: 55 - i, due_date: '2026-11-09', done_at: null } as Task));
  tasks.push({ id: 100, due_date: '2026-11-08', done_at: 1 } as Task, { id: 101, due_date: null, done_at: null } as Task);
  const selected = tasksToSchedule(tasks, now);
  expect(selected).toHaveLength(50);
  expect(selected.map(item => item.task.id)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
});
