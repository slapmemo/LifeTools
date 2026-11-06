import { popupDb } from '../../db/client';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  extractDomain,
  showToast,
  type KebabMenuItem
} from '../../panel/ui';
import { createWatchRepo, type Kind, type Status, type WatchItem } from './repo';

const STATUS_LABELS: Record<Status, string> = {
  izlenecek: 'İzlenecek',
  izleniyor: 'İzleniyor',
  bitti: 'Bitti'
};

const KIND_LABELS: Record<Kind, string> = {
  film: 'Film',
  dizi: 'Dizi',
  video: 'Video',
  diger: 'Diğer'
};

const EMPTY_TITLES: Record<Status, string> = {
  izlenecek: 'İzlenecek listesi henüz boş.',
  izleniyor: 'Şu an izlenen bir kayıt yok.',
  bitti: 'Bitirilenler listesi henüz boş.'
};

export function initWatchlistPanel(): { render(): Promise<void>; openNewForm(): void } {
  const repo = createWatchRepo(popupDb);
  let status: Status = 'izlenecek';
  let editingId: number | null = null;

  const root = document.querySelector('#watchlist-panel') as HTMLElement;
  const form = root.querySelector<HTMLFormElement>('#watch-form') ?? root.querySelector('form')!;
  const titleInput = root.querySelector('#watch-title') as HTMLInputElement;
  const kindSelect = root.querySelector('#watch-kind') as HTMLSelectElement;
  const urlInput = root.querySelector<HTMLInputElement>('#watch-url');
  const newBtn = document.querySelector<HTMLButtonElement>('#watch-new-btn');
  const cancelBtn = root.querySelector<HTMLButtonElement>('#watch-cancel');
  const list = root.querySelector('#watch-list') as HTMLElement;
  const empty = root.querySelector<HTMLElement>('#watch-empty');
  const feedback = root.querySelector('#watch-feedback') as HTMLElement;

  function notify(message: string, isError = false): void {
    feedback.textContent = message;
    showToast(message, isError ? 'error' : 'info');
  }

  function toggleNewForm(open?: boolean): void {
    const show = open ?? form.hidden;
    form.hidden = !show;
    if (show) {
      titleInput.focus();
    } else {
      form.reset();
    }
  }

  newBtn?.addEventListener('click', () => toggleNewForm());
  cancelBtn?.addEventListener('click', () => toggleNewForm(false));

  async function act(fn: () => Promise<unknown>, okMessage?: string): Promise<void> {
    try {
      await fn();
      feedback.textContent = '';
      if (okMessage) showToast(okMessage, 'info');
      await render();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'İşlem başarısız.', true);
    }
  }

  function buildItem(row: WatchItem): HTMLLIElement {
    const kindChip = document.createElement('span');
    kindChip.className = 'chip';
    kindChip.textContent = KIND_LABELS[row.kind] ?? row.kind;

    const contentWrap = document.createElement('div');
    contentWrap.className = 'watch-row-main';

    const headLine = document.createElement('div');
    headLine.className = 'watch-row-titleline';
    const titleEl = document.createElement('strong');
    titleEl.className = 'watch-title';
    titleEl.textContent = row.title;
    headLine.append(titleEl);

    const domain = extractDomain(row.url);
    if (domain && row.url) {
      const link = document.createElement('a');
      link.className = 'muted-link';
      link.href = row.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = domain;
      link.title = row.url;
      headLine.append(link);
    }
    contentWrap.append(headLine);

    if (row.note) {
      const noteEl = document.createElement('p');
      noteEl.className = 'watch-note muted';
      noteEl.textContent = row.note;
      contentWrap.append(noteEl);
    }

    if (editingId === row.id) {
      const editor = document.createElement('form');
      editor.className = 'inline-editor';

      const editRow = document.createElement('div');
      editRow.className = 'inline-editor-row';

      const editTitle = document.createElement('input');
      editTitle.type = 'text';
      editTitle.maxLength = 300;
      editTitle.required = true;
      editTitle.value = row.title;
      editTitle.setAttribute('aria-label', 'Başlık');

      const editKind = document.createElement('select');
      editKind.setAttribute('aria-label', 'Tür');
      for (const [v, l] of Object.entries(KIND_LABELS)) {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = l;
        editKind.append(o);
      }
      editKind.value = row.kind;
      editRow.append(editTitle, editKind);

      const editNote = document.createElement('input');
      editNote.type = 'text';
      editNote.placeholder = 'Not (isteğe bağlı)…';
      editNote.value = row.note ?? '';
      editNote.setAttribute('aria-label', 'Not');

      const actions = document.createElement('div');
      actions.className = 'inline-editor-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'submit';
      saveBtn.className = 'primary';
      saveBtn.textContent = 'Kaydet';
      const cancelEditBtn = document.createElement('button');
      cancelEditBtn.type = 'button';
      cancelEditBtn.textContent = 'Vazgeç';
      cancelEditBtn.addEventListener('click', () => {
        editingId = null;
        void render();
      });
      actions.append(saveBtn, cancelEditBtn);

      editor.append(editRow, editNote, actions);
      editor.addEventListener('submit', event => {
        event.preventDefault();
        void act(async () => {
          await repo.update(row.id, {
            title: editTitle.value,
            kind: editKind.value as Kind,
            url: row.url,
            note: editNote.value.trim() || null
          });
          editingId = null;
        }, 'Kayıt güncellendi.');
      });
      contentWrap.append(editor);
    }

    const statusSwitch = document.createElement('div');
    statusSwitch.className = 'segmented segmented-sm';
    statusSwitch.setAttribute('role', 'group');
    statusSwitch.setAttribute('aria-label', 'Durum değiştir');
    for (const s of Object.keys(STATUS_LABELS) as Status[]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `seg-btn${s === row.status ? ' active' : ''}`;
      b.setAttribute('aria-pressed', String(s === row.status));
      b.textContent = STATUS_LABELS[s];
      b.addEventListener('click', () => {
        if (s === row.status) return;
        void act(() => repo.setStatus(row.id, s), `Durum "${STATUS_LABELS[s]}" yapıldı.`);
      });
      statusSwitch.append(b);
    }

    const menuItems: KebabMenuItem[] = [
      {
        label: 'Düzenle',
        icon: 'pencil',
        onSelect: () => {
          editingId = editingId === row.id ? null : row.id;
          void render();
        }
      }
    ];

    if (domain && row.url) {
      const targetUrl = row.url;
      menuItems.push({
        label: 'Kaynağı aç',
        icon: 'external-link',
        onSelect: () => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        }
      });
    }

    menuItems.push({
      label: 'Sil',
      icon: 'trash-2',
      danger: true,
      confirm: true,
      onSelect: () => act(() => repo.delete(row.id), 'İzleme listesinden silindi.')
    });

    return createListRow({
      leading: kindChip,
      content: contentWrap,
      meta: statusSwitch,
      actions: createKebabMenu(menuItems, 'İzleme listesi işlemleri'),
      className: 'watch-item'
    });
  }

  async function render(): Promise<void> {
    const rows = await repo.list(status);
    list.replaceChildren(...rows.map(buildItem));
    list.hidden = rows.length === 0;
    if (empty) {
      empty.hidden = rows.length > 0;
      if (rows.length === 0) {
        empty.replaceChildren(
          createEmptyState({
            icon: 'clapperboard',
            title: EMPTY_TITLES[status],
            hint: 'Yukarıdaki ＋ Ekle düğmesiyle veya bir sayfada sağ tıklayarak ekleyebilirsin.'
          })
        );
      }
    }
    root.querySelectorAll<HTMLButtonElement>('[data-watch-status]').forEach(b => {
      const active = b.dataset.watchStatus === status;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  root.querySelectorAll<HTMLButtonElement>('[data-watch-status]').forEach(b => {
    b.addEventListener('click', () => {
      status = b.dataset.watchStatus as Status;
      void render();
    });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    void act(async () => {
      const rawUrl = urlInput?.value.trim() || null;
      await repo.add({
        title: titleInput.value,
        kind: kindSelect.value as Kind,
        url: rawUrl
      });
      titleInput.value = '';
      if (urlInput) urlInput.value = '';
      form.hidden = true;
    }, 'İzleme listesine eklendi.');
  });

  return { render, openNewForm: () => toggleNewForm(true) };
}
