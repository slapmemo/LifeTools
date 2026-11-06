import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  formatRelativeDate,
  showToast
} from '../../panel/ui';
import { CLOSED_KEY, type ClosedPinned } from './guard';
import { loadClosed, removeClosed, reopenPinned } from './restore';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

export function initPinnedGuardPanel(): { render(): Promise<void> } {
  const list = $<HTMLElement>('#pinned-closed');
  const empty = document.querySelector<HTMLElement>('#pinned-empty');
  const feedback = $<HTMLElement>('#pinned-feedback');
  let seq = 0;

  function fail(err: unknown): void {
    const msg = err instanceof Error ? err.message : 'İşlem başarısız. Tekrar dene.';
    feedback.textContent = msg;
    feedback.className = 'feedback error';
    showToast(msg, 'error');
  }

  async function act(action: () => Promise<unknown>, okText?: string): Promise<void> {
    try {
      await action();
      feedback.textContent = '';
      if (okText) showToast(okText, 'info');
      await render();
    } catch (err) {
      fail(err);
    }
  }

  function item(entry: ClosedPinned): HTMLLIElement {
    const content = document.createElement('div');
    content.className = 'pinned-row-main';
    const title = document.createElement('strong');
    title.className = 'clamp-1';
    title.textContent = entry.title || entry.url;
    const sub = document.createElement('span');
    sub.className = 'muted clamp-1';
    sub.textContent = extractDomain(entry.url) || entry.url;
    content.append(title, sub);

    const date = document.createElement('span');
    date.className = 'muted';
    date.textContent = formatRelativeDate(entry.closedAt);
    date.title = new Date(entry.closedAt).toLocaleString('tr-TR');

    const actions = document.createElement('div');
    actions.className = 'row-action-group';
    const reopen = document.createElement('button');
    reopen.type = 'button';
    reopen.textContent = 'Geri aç';
    reopen.addEventListener('click', () => {
      void act(() => reopenPinned(entry), 'Sabit sekme geri açıldı.');
    });

    const kebab = createKebabMenu(
      [
        {
          label: 'Listeden kaldır',
          icon: 'trash-2',
          danger: true,
          onSelect: () => act(() => removeClosed(entry.key), 'Kayıt kaldırıldı.')
        }
      ],
      'Sabit sekme işlemleri'
    );

    actions.append(reopen, kebab);

    return createListRow({
      content,
      meta: date,
      actions,
      className: 'pinned-item'
    });
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const entries = await loadClosed();
      if (current !== seq) return;
      list.replaceChildren(...entries.map(item));
      list.hidden = entries.length === 0;
      if (empty) {
        empty.hidden = entries.length > 0;
        if (entries.length === 0) {
          empty.replaceChildren(
            createEmptyState({
              icon: 'layout-grid',
              title: 'Son zamanlarda kapanan sabit sekme yok.',
              hint: 'Sabit sekme kapanınca bildirim gösterilir ve buradan geri açılabilir.'
            })
          );
        }
      }
    } catch (err) {
      if (current === seq) fail(err);
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[CLOSED_KEY] && !list.closest('[hidden]')) void render();
  });

  return { render };
}
