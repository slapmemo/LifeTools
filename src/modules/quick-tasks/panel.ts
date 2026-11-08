import { icon } from '../../../design/icons';
import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  confirmSecondClick,
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  groupTasksByDate,
  showToast,
  type KebabMenuItem
} from '../../panel/ui';
import { createTasksRepo, localToday, type Task } from './repo';
import { REMINDERS_KEY } from './reminders';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

const GROUP_DEFS = [
  { key: 'overdue', label: 'Gecikmiş', danger: true },
  { key: 'today', label: 'Bugün', danger: false },
  { key: 'upcoming', label: 'Yaklaşan', danger: false },
  { key: 'undated', label: 'Tarihsiz', danger: false }
] as const;

export function initQuickTasksPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createTasksRepo(db, Date.now, () => { void chrome.runtime.sendMessage({ type: 'quick-tasks:reschedule' }).catch(() => {}); });
  const reminderToggle = $<HTMLInputElement>('#task-reminders');
  void chrome.storage.local.get({ [REMINDERS_KEY]: false }).then(data => { reminderToggle.checked = data[REMINDERS_KEY] === true; });
  reminderToggle.addEventListener('change', () => { void chrome.storage.local.set({ [REMINDERS_KEY]: reminderToggle.checked }); });
  const form = $<HTMLFormElement>('#task-form');
  const title = $<HTMLInputElement>('#task-title');
  const date = $<HTMLInputElement>('#task-date');
  const openContainer = $<HTMLElement>('#task-open');
  const emptyContainer = document.querySelector<HTMLElement>('#task-empty');
  const doneList = $<HTMLElement>('#task-done');
  const doneDetails = document.querySelector<HTMLDetailsElement>('#task-done-details');
  const doneLabel = document.querySelector<HTMLElement>('#task-done-label');
  const clearBtn = $<HTMLButtonElement>('#task-clear');
  const count = $<HTMLElement>('#task-count');
  const feedback = $<HTMLElement>('#task-feedback');

  let seq = 0;
  let editingId: number | null = null;

  function notify(message: string, isError = false): void {
    feedback.textContent = message;
    feedback.className = isError ? 'feedback error' : 'feedback success';
    showToast(message, isError ? 'error' : 'info');
  }

  async function act(action: () => Promise<unknown>, okMessage?: string): Promise<void> {
    try {
      await action();
      feedback.textContent = '';
      if (okMessage) showToast(okMessage, 'info');
      await render();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.', true);
    }
  }

  function buildItem(task: Task, today: string): HTMLLIElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'round-checkbox';
    checkbox.checked = task.done_at !== null;
    checkbox.setAttribute('aria-label', `${task.title} tamamlandı`);
    checkbox.addEventListener('change', () => {
      void act(() => repo.toggleDone(task.id));
    });

    const contentWrap = document.createElement('div');
    contentWrap.className = 'task-row-main';

    const text = document.createElement('span');
    text.className = `task-title${task.done_at !== null ? ' done' : ''}`;
    text.textContent = task.title;
    contentWrap.append(text);

    if (editingId === task.id) {
      const editor = document.createElement('form');
      editor.className = 'inline-editor';

      const row = document.createElement('div');
      row.className = 'inline-editor-row';

      const editTitle = document.createElement('input');
      editTitle.type = 'text';
      editTitle.maxLength = 300;
      editTitle.required = true;
      editTitle.value = task.title;
      editTitle.setAttribute('aria-label', 'Görev başlığı');

      const editDate = document.createElement('input');
      editDate.type = 'date';
      editDate.value = task.due_date ?? '';
      editDate.setAttribute('aria-label', 'Son tarih');

      row.append(editTitle, editDate);

      const actions = document.createElement('div');
      actions.className = 'inline-editor-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Kaydet';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Vazgeç';
      cancelBtn.addEventListener('click', () => {
        editingId = null;
        void render();
      });
      actions.append(saveBtn, cancelBtn);

      editor.append(row, actions);
      editor.addEventListener('submit', event => {
        event.preventDefault();
        void act(async () => {
          await repo.update(task.id, {
            title: editTitle.value,
            due_date: editDate.value || null,
            note: task.note,
            url: task.url
          });
          editingId = null;
        }, 'Görev güncellendi.');
      });
      contentWrap.append(editor);
    }

    const metaWrap = document.createElement('div');
    metaWrap.className = 'task-meta';

    if (task.due_date) {
      const due = document.createElement('span');
      const isOverdue = task.done_at === null && task.due_date < today;
      due.className = `chip task-date${isOverdue ? ' chip-danger' : ''}`;
      due.textContent = task.due_date === today ? 'Bugün' : task.due_date;
      metaWrap.append(due);
    }

    const domain = extractDomain(task.url);
    if (domain && task.url) {
      const link = document.createElement('a');
      link.href = task.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'icon-button task-link';
      link.title = task.url;
      link.setAttribute('aria-label', 'Bağlantıyı aç');
      link.append(icon('link', 15));
      metaWrap.append(link);
    }

    const menuItems: KebabMenuItem[] = [
      {
        label: 'Düzenle',
        icon: 'pencil',
        onSelect: () => {
          editingId = editingId === task.id ? null : task.id;
          void render();
        }
      },
      {
        label: 'Sil',
        icon: 'trash-2',
        danger: true,
        confirm: true,
        onSelect: () => act(() => repo.delete(task.id), 'Görev silindi.')
      }
    ];

    return createListRow({
      leading: checkbox,
      content: contentWrap,
      meta: metaWrap,
      actions: createKebabMenu(menuItems, 'Görev işlemleri'),
      className: 'task-item'
    });
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const [tasks, completed] = await Promise.all([repo.listOpen(), repo.listDone()]);
      if (current !== seq) return;

      const today = localToday(Date.now());
      const groups = groupTasksByDate(tasks, today);

      openContainer.replaceChildren();
      for (const def of GROUP_DEFS) {
        const items = groups[def.key];
        if (items.length === 0) continue;

        const section = document.createElement('div');
        section.className = `card task-group${def.danger ? ' task-group-danger' : ''}`;

        const header = document.createElement('div');
        header.className = 'task-group-header';
        const h3 = document.createElement('h3');
        h3.textContent = def.label;
        const badge = document.createElement('span');
        badge.className = `chip${def.danger ? ' chip-danger' : ''}`;
        badge.textContent = String(items.length);
        header.append(h3, badge);

        const ul = document.createElement('ul');
        ul.className = 'task-list';
        ul.append(...items.map(t => buildItem(t, today)));

        section.append(header, ul);
        openContainer.append(section);
      }

      if (emptyContainer) {
        emptyContainer.hidden = tasks.length > 0;
        if (tasks.length === 0) {
          emptyContainer.replaceChildren(
            createEmptyState({
              icon: 'list-checks',
              title: 'Açık görev yok.',
              hint: 'Yukarıdaki satırdan başlık ve isteğe bağlı tarih girerek görev ekleyebilirsin.'
            })
          );
        }
      }

      doneList.replaceChildren(...completed.map(t => buildItem(t, today)));
      if (doneLabel) doneLabel.textContent = `Tamamlananlar (${completed.length})`;
      if (doneDetails) doneDetails.hidden = completed.length === 0;
      clearBtn.hidden = completed.length === 0;
      count.textContent = String(tasks.length);
    } catch (err) {
      if (current === seq) notify(err instanceof Error ? err.message : 'Görevler yüklenemedi.', true);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    void (async () => {
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
      button.disabled = true;
      try {
        await repo.add({ title: title.value, due_date: date.value || null });
        title.value = '';
        date.value = '';
        feedback.textContent = '';
        showToast('Görev eklendi.', 'info');
        await render();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Görev eklenemedi.', true);
      } finally {
        button.disabled = false;
      }
    })();
  });

  confirmSecondClick(clearBtn, () => act(() => repo.clearDone(), 'Tamamlanan görevler temizlendi.'));

  return { render };
}
