import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import { closeWindowSafely, describeTabs, groupWindowBySite, openSession } from './browser';
import { createSessionsRepo, type Session } from './repo';
import { findDuplicates } from './tabs';

function $<T extends HTMLElement>(selector: string): T { return document.querySelector(selector) as T; }

export function initLifeBrowserPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createSessionsRepo(db);
  const form = $<HTMLFormElement>('#lb-save-form'), name = $<HTMLInputElement>('#lb-name'), closeAfter = $<HTMLInputElement>('#lb-close');
  const list = $<HTMLElement>('#lb-sessions'), count = $<HTMLElement>('#lb-count'), feedback = $<HTMLElement>('#lb-feedback');
  const dupList = $<HTMLElement>('#lb-duplicates'), dedupe = $<HTMLButtonElement>('#lb-dedupe'), groupButton = $<HTMLButtonElement>('#lb-group');
  let seq = 0;
  let pendingClose: number[] = [];
  function say(text: string, error = false): void { feedback.textContent = text; feedback.className = error ? 'feedback error' : 'feedback'; }
  function fail(err: unknown): void { say(err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.', true); }
  async function act(action: () => Promise<unknown>): Promise<void> { try { await action(); await render(); } catch (err) { fail(err); } }
  async function currentWindowId(): Promise<number> {
    const win = await chrome.windows.getCurrent();
    if (win.id === undefined) throw new Error('Pencere bulunamadı.');
    return win.id;
  }

  function sessionItem(session: Session): HTMLLIElement {
    const li = document.createElement('li'); li.className = 'memo-item';
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = session.name;
    const meta = document.createElement('p'); meta.className = 'hint';
    meta.textContent = `${session.tab_count} sekme · ${new Date(session.created_at).toLocaleString('tr-TR')}`;
    text.append(title, meta);
    const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Aç';
    open.addEventListener('click', () => { void act(async () => { await openSession(await repo.tabs(session.id)); }); });
    let confirm = false;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Sil';
    remove.addEventListener('click', () => {
      if (!confirm) { confirm = true; remove.textContent = 'Emin misin?'; return; }
      void act(() => repo.delete(session.id));
    });
    li.append(text, open, remove);
    return li;
  }

  async function renderDuplicates(): Promise<void> {
    const sets = findDuplicates(await chrome.tabs.query({ currentWindow: true }));
    pendingClose = sets.flatMap(set => set.close);
    dupList.replaceChildren(...sets.map(set => {
      const li = document.createElement('li'); li.className = 'memo-item';
      li.textContent = `${set.url} — ${set.close.length + 1} sekme`;
      return li;
    }));
    if (!sets.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'Bu pencerede kopya sekme yok.'; dupList.append(li); }
    dedupe.hidden = !pendingClose.length;
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const sessions = await repo.list();
      if (current !== seq) return;
      list.replaceChildren(...sessions.map(sessionItem));
      count.textContent = String(sessions.length);
      await renderDuplicates();
    } catch (err) { if (current === seq) fail(err); }
  }

  form.addEventListener('submit', event => { event.preventDefault(); void (async () => {
    const button = form.querySelector('button') as HTMLButtonElement; button.disabled = true;
    try {
      const windowId = await currentWindowId();
      const tabs = await chrome.tabs.query({ windowId });
      await repo.save(name.value, await describeTabs(tabs));
      name.value = '';
      say(`${tabs.length} sekme kaydedildi.`);
      if (closeAfter.checked) { closeAfter.checked = false; await closeWindowSafely(windowId); return; }
      await render();
    } catch (err) { fail(err); } finally { button.disabled = false; }
  })(); });
  groupButton.addEventListener('click', () => { void act(async () => {
    const created = await groupWindowBySite(await currentWindowId());
    say(created ? `${created} grup oluşturuldu.` : 'Gruplanacak (en az 2 sekmeli) site yok.');
  }); });
  dedupe.addEventListener('click', () => { void act(async () => {
    if (!pendingClose.length) return;
    const closed = pendingClose.length;
    await chrome.tabs.remove(pendingClose);
    say(`${closed} kopya sekme kapatıldı.`);
  }); });
  return { render };
}
