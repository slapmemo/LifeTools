import { api, type PinnedWindow } from '../api';
import { h, type View } from '../dom';

export function windowsView(): View {
  const list = h('div', { class: 'list' });
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
    h('div', { class: 'toolbar' }, releaseAll),
    list
  );

  function render(items: PinnedWindow[]): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(h('div', { class: 'empty' }, 'Üstte tutulan pencere yok.'));
      return;
    }
    for (const w of items) {
      list.append(
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'txt' }, w.title || '(başlıksız)', h('div', { class: 'muted' }, w.exe)),
          h(
            'div',
            { class: 'meta' },
            h('button', { class: 'small', onClick: async () => render(await api.windowsRelease(w.hwnd)) }, 'Kaldır')
          )
        )
      );
    }
  }

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
