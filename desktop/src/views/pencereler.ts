import { api, type PinnedWindow } from '../api';
import { h, type View } from '../dom';
import { emptyState } from '../view-components';

export function windowsView(): View {
  const list = h('div', { class: 'card list-card' });
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Pencerelerde ara…', 'aria-label': 'Pencerelerde ara' });
  let items: PinnedWindow[] = [];
  const releaseAll = h('button', { class: 'danger' }, 'Tümünü bırak');
  const el = h(
    'section',
    {},
    h('h2', {}, 'Üstte tutulan pencereler'),
    h(
      'p',
      { class: 'muted' },
      'Herhangi bir pencerede Ctrl+Alt+T ile o pencereyi üstte tut / bırak. Tepsi menüsünden de yapılabilir.'
    ),
    h('div', { class: 'toolbar' }, search, releaseAll),
    list
  );

  function render(next: PinnedWindow[]): void {
    items = next;
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase('tr-TR');
    const filtered = items.filter((w) => `${w.title} ${w.exe}`.toLocaleLowerCase('tr-TR').includes(query));
    if (filtered.length === 0) {
      list.append(emptyState(query ? 'Sonuç yok' : 'Üstte tutulan pencere yok', query ? 'Başka bir arama deneyin.' : 'Ctrl+Alt+T ile bir pencereyi üstte tutabilirsiniz.'));
      return;
    }
    for (const w of filtered) {
      const toggle = h('input', { type: 'checkbox', checked: true, 'aria-label': `${w.title || 'Başlıksız pencere'} üstte tut` });
      toggle.addEventListener('change', async () => {
        toggle.disabled = true;
        try { render(await api.windowsRelease(w.hwnd)); }
        catch { toggle.checked = true; toggle.disabled = false; }
      });
      list.append(
        h(
          'div',
          { class: 'list-row' },
          h('div', { class: 'list-row-content' }, w.title || '(başlıksız)', h('div', { class: 'muted' }, w.exe)),
          h('label', { class: 'switch' }, 'Üstte tut', toggle)
        )
      );
    }
  }

  search.addEventListener('input', () => render(items));
  releaseAll.addEventListener('click', async () => render(await api.windowsReleaseAll()));
  return { el, refresh: async () => render(await api.windowsList()) };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = windowsView();
  return instance;
}

export function mount(container: HTMLElement): void {
  const v = ensureView();
  container.replaceChildren(v.el);
  void v.refresh();
}

export function unmount(): void {
  instance?.el.remove();
}

export function refresh(): Promise<void> | void {
  return ensureView().refresh();
}
