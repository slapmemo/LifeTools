import { originFromInput } from '../../core/site-scripts';
import { popupDb } from '../../db/client';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  showToast
} from '../../panel/ui';
import { CHANGE_KEY, SITES_KEY } from './background';
import { createSnippetsRepo, type Snippet } from './repo';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function initSmartRepliesPanel(): { render(): Promise<void> } {
  const repo = createSnippetsRepo(popupDb);
  const form = $<HTMLFormElement>('snippet-form');
  const formHeading = document.getElementById('snippet-form-title');
  const formAnchor = document.getElementById('snippet-form-anchor');
  const newBtn = document.getElementById('snippet-new-btn') as HTMLButtonElement | null;
  const trigger = $<HTMLInputElement>('snippet-trigger');
  const title = $<HTMLInputElement>('snippet-title');
  const body = $<HTMLTextAreaElement>('snippet-body');
  const cancelBtn = $<HTMLButtonElement>('snippet-cancel');
  const search = $<HTMLInputElement>('snippet-search');
  const list = $<HTMLElement>('snippet-list');
  const empty = document.getElementById('snippet-empty');
  const feedback = $<HTMLElement>('snippet-feedback');
  const siteForm = $<HTMLFormElement>('snippet-site-form');
  const site = $<HTMLInputElement>('snippet-site');
  const sites = $<HTMLElement>('snippet-sites');

  let editing: number | null = null;
  let seq = 0;

  function message(text: string, isError = false): void {
    feedback.textContent = text;
    showToast(text, isError ? 'error' : 'info');
  }

  function closeEditor(): void {
    editing = null;
    form.reset();
    form.hidden = true;
    if (formAnchor && form.parentElement !== formAnchor) {
      formAnchor.append(form);
    }
  }

  function openNewEditor(): void {
    editing = null;
    form.reset();
    if (formHeading) formHeading.textContent = 'Yeni şablon';
    if (formAnchor) formAnchor.append(form);
    form.hidden = false;
    trigger.focus();
  }

  function openRowEditor(row: Snippet, rowEl: HTMLElement): void {
    if (editing === row.id && !form.hidden) {
      closeEditor();
      return;
    }
    editing = row.id;
    if (formHeading) formHeading.textContent = 'Şablonu düzenle';
    trigger.value = row.trigger;
    title.value = row.title;
    body.value = row.body;
    rowEl.after(form);
    form.hidden = false;
    trigger.focus();
  }

  newBtn?.addEventListener('click', () => {
    if (!form.hidden && editing === null) {
      closeEditor();
    } else {
      openNewEditor();
    }
  });

  cancelBtn.onclick = () => closeEditor();

  async function changed(): Promise<void> {
    await chrome.storage.local.set({ [CHANGE_KEY]: Date.now() + Math.random() });
  }

  function formatOriginLabel(origin: string): string {
    return origin.replace(/^\*:\/\//, '').replace(/^https?:\/\//, '').replace(/\/\*$/, '');
  }

  async function render(): Promise<void> {
    const current = ++seq;
    try {
      const [rows, data] = await Promise.all([
        repo.list(search.value.trim()),
        chrome.storage.local.get({ [SITES_KEY]: [] })
      ]);
      if (current !== seq) return;

      if (formAnchor && form.parentElement !== formAnchor && editing === null) {
        formAnchor.append(form);
      }

      // Preserve the editor when its current row is rebuilt.
      if (form.parentElement === list && formAnchor) formAnchor.append(form);
      list.replaceChildren();
      for (const row of rows) {
        const chip = document.createElement('code');
        chip.className = 'chip chip-mono';
        chip.textContent = row.trigger;

        const contentWrap = document.createElement('div');
        contentWrap.className = 'snippet-row-main';

        const titleEl = document.createElement('strong');
        titleEl.className = 'snippet-title';
        titleEl.textContent = row.title;

        const previewEl = document.createElement('p');
        previewEl.className = 'snippet-preview clamp-1 muted';
        previewEl.textContent = row.body;

        contentWrap.append(titleEl, previewEl);

        const uses = document.createElement('span');
        uses.className = 'muted snippet-uses';
        uses.title = `${row.use_count} kez kullanıldı`;
        uses.textContent = `${row.use_count}×`;

        let li: HTMLLIElement;
        const menu = createKebabMenu(
          [
            {
              label: 'Kopyala',
              icon: 'copy',
              onSelect: () => {
                void navigator.clipboard
                  .writeText(row.body)
                  .then(() => message('Metin kopyalandı.'))
                  .catch(() => message('Metin kopyalanamadı.', true));
              }
            },
            {
              label: 'Düzenle',
              icon: 'pencil',
              onSelect: () => openRowEditor(row, li)
            },
            {
              label: 'Sil',
              icon: 'trash-2',
              danger: true,
              confirm: true,
              onSelect: () => {
                if (editing === row.id) closeEditor();
                void repo
                  .delete(row.id)
                  .then(changed)
                  .then(render)
                  .then(() => message('Şablon silindi.'))
                  .catch(() => message('Şablon silinemedi.', true));
              }
            }
          ],
          'Şablon işlemleri'
        );

        li = createListRow({
          leading: chip,
          content: contentWrap,
          meta: uses,
          actions: menu,
          className: 'snippet-row',
          onClick: () => openRowEditor(row, li)
        });

        list.append(li);
        if (editing === row.id && !form.hidden) {
          li.after(form);
        }
      }

      list.hidden = rows.length === 0;
      if (empty) {
        empty.hidden = rows.length > 0;
        if (rows.length === 0) {
          empty.replaceChildren(
            createEmptyState({
              icon: 'text-cursor-input',
              title: search.value.trim() ? 'Aramanla eşleşen şablon yok.' : 'Henüz şablon eklenmedi.',
              hint: 'Sık yazdığın yanıtları /tetikleyici ile kaydet; yazarken Space veya Tab ile genişlet.'
            })
          );
        }
      }

      sites.replaceChildren();
      const origins = data[SITES_KEY] as string[];
      if (origins.length === 0) {
        const emptyHint = document.createElement('li');
        emptyHint.className = 'muted';
        emptyHint.textContent = 'Henüz site eklenmedi.';
        sites.append(emptyHint);
      } else {
        for (const origin of origins) {
          const li = document.createElement('li');
          li.className = 'chip site-chip';
          const textSpan = document.createElement('span');
          textSpan.textContent = formatOriginLabel(origin);
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'chip-remove';
          remove.textContent = '×';
          remove.title = 'Siteyi kaldır';
          remove.setAttribute('aria-label', `${origin} kaldır`);
          remove.onclick = () => {
            void (async () => {
              const currentData = await chrome.storage.local.get({ [SITES_KEY]: [] });
              await chrome.storage.local.set({
                [SITES_KEY]: (currentData[SITES_KEY] as string[]).filter(x => x !== origin)
              });
              await chrome.permissions.remove({ origins: [origin] });
              await render();
              message('Site kaldırıldı.');
            })().catch(() => message('Site kaldırılamadı.', true));
          };
          li.append(textSpan, remove);
          sites.append(li);
        }
      }
    } catch {
      message('Şablonlar yüklenemedi.', true);
    }
  }

  form.onsubmit = event => {
    event.preventDefault();
    void (async () => {
      try {
        const input = { trigger: trigger.value, title: title.value, body: body.value };
        if (editing === null) await repo.add(input);
        else await repo.update(editing, input);
        closeEditor();
        await changed();
        await render();
        message('Şablon kaydedildi.');
      } catch (err) {
        message(err instanceof Error ? err.message : 'Şablon kaydedilemedi.', true);
      }
    })();
  };

  search.oninput = () => {
    void render();
  };

  siteForm.onsubmit = event => {
    event.preventDefault();
    const origin = originFromInput(site.value);
    if (!origin) {
      message('Geçerli bir site adresi gir.', true);
      return;
    }
    void chrome.permissions
      .request({ origins: [origin] })
      .then(async granted => {
        if (!granted) {
          message('Site izni verilmedi.', true);
          return;
        }
        const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
        await chrome.storage.local.set({
          [SITES_KEY]: [...new Set([...(data[SITES_KEY] as string[]), origin])]
        });
        site.value = '';
        await render();
        message('Site eklendi.');
      })
      .catch(() => message('Site eklenemedi.', true));
  };

  return { render };
}
