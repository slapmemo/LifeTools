import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import { createTasksRepo, localToday, type Task } from './repo';
function $<T extends HTMLElement>(selector: string): T { return document.querySelector(selector) as T; }
export function initQuickTasksPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createTasksRepo(db);
  const form = $<HTMLFormElement>('#task-form'), title = $<HTMLInputElement>('#task-title'), date = $<HTMLInputElement>('#task-date'), attach = $<HTMLInputElement>('#task-attach');
  const open = $<HTMLElement>('#task-open'), done = $<HTMLElement>('#task-done'), count = $<HTMLElement>('#task-count'), feedback = $<HTMLElement>('#task-feedback');
  let seq = 0;
  function error(err: unknown): void { feedback.textContent = err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.'; feedback.className = 'feedback error'; }
  async function act(action: () => Promise<unknown>): Promise<void> { try { await action(); await render(); } catch (err) { error(err); } }
  function item(task: Task): HTMLLIElement {
    const li = document.createElement('li'); li.className = 'task-item';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done_at !== null; checkbox.setAttribute('aria-label', task.title + ' tamamlandı');
    checkbox.addEventListener('change', () => { void act(() => repo.toggleDone(task.id)); });
    const text = document.createElement('span'); text.className = 'task-title'; text.textContent = task.title;
    li.append(checkbox, text);
    if (task.due_date) {
      const due = document.createElement('span'); due.className = 'task-date';
      const today = localToday(Date.now()); due.textContent = task.due_date === today ? 'Bugün' : task.due_date;
      if (task.done_at === null && task.due_date < today) due.classList.add('overdue');
      li.append(due);
    }
    if (task.url) {
      try { const url = new URL(task.url); if (url.protocol === 'https:' || url.protocol === 'http:') {
        const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '🔗'; link.title = 'Bağlantıyı aç'; link.setAttribute('aria-label', 'Bağlantıyı aç'); li.append(link);
      } } catch { /* Geçersiz bağlantı gösterilmez. */ }
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Görevi sil');
    remove.addEventListener('click', () => { void act(() => repo.delete(task.id)); }); li.append(remove);
    return li;
  }
  async function render(): Promise<void> {
    const current = ++seq;
    try { const [tasks, completed] = await Promise.all([repo.listOpen(), repo.listDone()]); if (current !== seq) return;
      open.replaceChildren(...tasks.map(item)); done.replaceChildren(...completed.map(item)); count.textContent = String(tasks.length);
    } catch (err) { if (current === seq) error(err); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void (async () => {
    const button = form.querySelector('button') as HTMLButtonElement; button.disabled = true;
    try { let url: string | undefined;
      if (attach.checked) { const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]; url = tab?.url; if (!url) throw new Error('Bu sayfanın bağlantısı alınamadı.'); }
      await repo.add({ title: title.value, due_date: date.value || null, url }); title.value = ''; date.value = ''; feedback.textContent = ''; await render();
    } catch (err) { error(err); } finally { button.disabled = false; }
  })(); });
  $('#task-clear').addEventListener('click', () => { void act(() => repo.clearDone()); });
  return { render };
}
