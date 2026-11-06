import { CLOSED_KEY, type ClosedPinned } from './guard';
import { loadClosed, removeClosed, reopenPinned } from './restore';

function $<T extends HTMLElement>(selector: string): T { return document.querySelector(selector) as T; }

export function initPinnedGuardPanel(): { render(): Promise<void> } {
  const list = $<HTMLElement>('#pinned-closed'), feedback = $<HTMLElement>('#pinned-feedback');
  let seq = 0;
  function fail(err: unknown): void { feedback.textContent = err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.'; feedback.className = 'feedback error'; }
  async function act(action: () => Promise<unknown>): Promise<void> { try { await action(); feedback.textContent = ''; await render(); } catch (err) { fail(err); } }
  function item(entry: ClosedPinned): HTMLLIElement {
    const li = document.createElement('li'); li.className = 'memo-item';
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = entry.title || entry.url;
    const meta = document.createElement('p'); meta.className = 'hint'; meta.textContent = new Date(entry.closedAt).toLocaleString('tr-TR');
    text.append(title, meta);
    const reopen = document.createElement('button'); reopen.type = 'button'; reopen.textContent = 'Geri aç';
    reopen.addEventListener('click', () => { void act(() => reopenPinned(entry)); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Listeden kaldır');
    remove.addEventListener('click', () => { void act(() => removeClosed(entry.key)); });
    li.append(text, reopen, remove);
    return li;
  }
  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const entries = await loadClosed();
      if (current !== seq) return;
      list.replaceChildren(...entries.map(item));
      if (!entries.length) { const li = document.createElement('li'); li.className = 'hint'; li.textContent = 'Son zamanlarda kapanan sabit sekme yok.'; list.append(li); }
    } catch (err) { if (current === seq) fail(err); }
  }
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes[CLOSED_KEY] && !list.closest('[hidden]')) void render(); });
  return { render };
}
