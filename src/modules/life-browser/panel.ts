import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import { showToast } from '../../panel/ui';
import { openTabManager } from '../tab-manager/open';
import { closeWindowSafely, describeTabs, groupWindowBySite } from './browser';
import { createSessionsRepo } from './repo';
import { AUTO_SAVE_KEY } from './settings';
import { findDuplicates } from './tabs';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

/**
 * Panel → Sekmeler → Kaydet: o anki pencere için hızlı işlemler.
 * Kayıtlı grupların listesi yalnızca Sekme Yöneticisi'nde; burada yalnızca sayısı ve oraya kısayol var.
 */
export function initLifeBrowserPanel(db: Executor = popupDb): { render(): Promise<void> } {
  const repo = createSessionsRepo(db);
  const form = $<HTMLFormElement>('#lb-save-form');
  const name = $<HTMLInputElement>('#lb-name');
  const closeAfter = document.querySelector<HTMLInputElement>('#lb-close');
  const saveCloseBtn = document.querySelector<HTMLButtonElement>('#lb-save-close');
  const count = $<HTMLElement>('#lb-count');
  const countHint = document.querySelector<HTMLElement>('#lb-count-hint');
  const openManager = document.querySelector<HTMLButtonElement>('#lb-open-manager');
  const feedback = $<HTMLElement>('#lb-feedback');
  const dupList = document.querySelector<HTMLElement>('#lb-duplicates');
  const dedupe = $<HTMLButtonElement>('#lb-dedupe');
  const groupButton = $<HTMLButtonElement>('#lb-group');
  const autoSave = $<HTMLInputElement>('#lb-auto-save');
  void chrome.storage.local.get({ [AUTO_SAVE_KEY]: false }).then(data => { autoSave.checked = data[AUTO_SAVE_KEY] !== false; });
  autoSave.addEventListener('change', () => { void chrome.storage.local.set({ [AUTO_SAVE_KEY]: autoSave.checked }); });

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
      count.textContent = String(sessions.length);
      if (countHint) {
        countHint.textContent = sessions.length
          ? 'Kaydettiğin gruplar Sekme Yöneticisi\'nde listelenir; orada açabilir, düzenleyebilir ve silebilirsin.'
          : 'Henüz kayıtlı grup yok. Bu penceredeki sekmeleri sonra tek tıkla geri açmak için yukarıdan kaydet.';
      }
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
      say(`${tabs.length} sekme kayıtlı gruba kaydedildi.`);
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

  openManager?.addEventListener('click', () => {
    void openTabManager().catch(fail);
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
