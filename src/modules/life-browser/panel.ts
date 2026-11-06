import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  formatRelativeDate,
  showToast
} from '../../panel/ui';
import { closeWindowSafely, describeTabs, groupWindowBySite, openSession } from './browser';
import { createSessionsRepo, type Session } from './repo';
import { findDuplicates } from './tabs';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

export function initLifeBrowserPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createSessionsRepo(db);
  const form = $<HTMLFormElement>('#lb-save-form');
  const name = $<HTMLInputElement>('#lb-name');
  const closeAfter = document.querySelector<HTMLInputElement>('#lb-close');
  const saveCloseBtn = document.querySelector<HTMLButtonElement>('#lb-save-close');
  const list = $<HTMLElement>('#lb-sessions');
  const empty = document.querySelector<HTMLElement>('#lb-empty');
  const count = $<HTMLElement>('#lb-count');
  const feedback = $<HTMLElement>('#lb-feedback');
  const dupList = document.querySelector<HTMLElement>('#lb-duplicates');
  const dedupe = $<HTMLButtonElement>('#lb-dedupe');
  const groupButton = $<HTMLButtonElement>('#lb-group');

  let seq = 0;
  let pendingClose: number[] = [];

  function say(text: string, error = false): void {
    feedback.textContent = text;
    feedback.className = error ? 'feedback error' : 'feedback';
    showToast(text, error ? 'error' : 'info');
  }

  function fail(err: unknown): void {
    say(err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.', true);
  }

  async function act(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
      await render();
    } catch (err) {
      fail(err);
    }
  }

  async function currentWindowId(): Promise<number> {
    const win = await chrome.windows.getCurrent();
    if (win.id === undefined) throw new Error('Pencere bulunamadı.');
    return win.id;
  }

  function sessionItem(session: Session): HTMLLIElement {
    const title = document.createElement('strong');
    title.className = 'session-name';
    title.textContent = session.name;

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const tabChip = document.createElement('span');
    tabChip.className = 'chip';
    tabChip.textContent = `${session.tab_count} sekme`;
    const dateSpan = document.createElement('span');
    dateSpan.className = 'muted';
    dateSpan.textContent = formatRelativeDate(session.created_at);
    dateSpan.title = new Date(session.created_at).toLocaleString('tr-TR');
    meta.append(tabChip, dateSpan);

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'row-action-group';
    const open = document.createElement('button');
    open.type = 'button';
    open.textContent = 'Aç';
    open.addEventListener('click', () => {
      void act(async () => {
        await openSession(await repo.tabs(session.id));
        say(`"${session.name}" oturumu açıldı.`);
      });
    });

    const kebab = createKebabMenu(
      [
        {
          label: 'Sil',
          icon: 'trash-2',
          danger: true,
          confirm: true,
          onSelect: () =>
            act(async () => {
              await repo.delete(session.id);
              say('Oturum silindi.');
            })
        }
      ],
      'Oturum işlemleri'
    );

    actionsWrap.append(open, kebab);

    return createListRow({
      content: title,
      meta,
      actions: actionsWrap,
      className: 'session-item'
    });
  }

  async function renderDuplicates(): Promise<void> {
    const sets = findDuplicates(await chrome.tabs.query({ currentWindow: true }));
    pendingClose = sets.flatMap(set => set.close);
    if (dupList) {
      dupList.replaceChildren(
        ...sets.map(set => {
          const li = document.createElement('li');
          li.className = 'muted';
          li.textContent = `${set.url} — ${set.close.length + 1} sekme`;
          return li;
        })
      );
      dupList.hidden = sets.length === 0;
    }
    dedupe.textContent = pendingClose.length > 0 ? `Kopyaları kapat (${pendingClose.length})` : 'Kopyaları kapat';
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const sessions = await repo.list();
      if (current !== seq) return;
      list.replaceChildren(...sessions.map(sessionItem));
      list.hidden = sessions.length === 0;
      if (empty) {
        empty.hidden = sessions.length > 0;
        if (sessions.length === 0) {
          empty.replaceChildren(
            createEmptyState({
              icon: 'layout-grid',
              title: 'Kayıtlı oturum yok.',
              hint: 'Bu penceredeki açık sekmeleri daha sonra tek tıkla geri açmak için yukarıdan kaydet.'
            })
          );
        }
      }
      count.textContent = String(sessions.length);
      await renderDuplicates();
    } catch (err) {
      if (current === seq) fail(err);
    }
  }

  async function saveCurrentWindow(shouldCloseWindow: boolean): Promise<void> {
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = true;
    if (saveCloseBtn) saveCloseBtn.disabled = true;
    try {
      const windowId = await currentWindowId();
      const tabs = await chrome.tabs.query({ windowId });
      await repo.save(name.value, await describeTabs(tabs));
      name.value = '';
      say(`${tabs.length} sekme kaydedildi.`);
      if (shouldCloseWindow) {
        if (closeAfter) closeAfter.checked = false;
        await closeWindowSafely(windowId);
        return;
      }
      await render();
    } catch (err) {
      fail(err);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (saveCloseBtn) saveCloseBtn.disabled = false;
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    void saveCurrentWindow(Boolean(closeAfter?.checked));
  });

  saveCloseBtn?.addEventListener('click', () => {
    void saveCurrentWindow(true);
  });

  groupButton.addEventListener('click', () => {
    void act(async () => {
      const created = await groupWindowBySite(await currentWindowId());
      say(created ? `${created} grup oluşturuldu.` : 'Gruplanacak (en az 2 sekmeli) site yok.');
    });
  });

  dedupe.addEventListener('click', () => {
    void act(async () => {
      await renderDuplicates();
      if (!pendingClose.length) {
        say('Bu pencerede kopya sekme yok.');
        return;
      }
      const closed = pendingClose.length;
      await chrome.tabs.remove(pendingClose);
      say(`${closed} kopya sekme kapatıldı.`);
    });
  });

  return { render };
}
