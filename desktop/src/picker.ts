import { listen } from '@tauri-apps/api/event';
import { api, type ClipItem } from './api';
import { h } from './dom';
import { emptyState } from './view-components';

export function mountPicker(root: HTMLElement): void {
  const search = h('input', { type: 'search', placeholder: 'Pano geçmişinde ara… (Enter: kopyala, Esc: kapat)' });
  const list = h('div', { class: 'card list-card picker-list' });
  root.append(h('div', { class: 'picker' }, search, list));

  let items: ClipItem[] = [];
  let sel = 0;

  async function choose(i: number): Promise<void> {
    const it = items[i];
    if (!it) return;
    try {
      await api.clipCopy(it.id);
    } finally {
      await api.pickerHide();
    }
  }

  function render(): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(h('div', { class: 'empty' }, 'Kayıt yok.'));
      return;
    }
    items.forEach((it, i) => {
      list.append(
        h(
          'div',
          { class: 'list-row clickable picker-row' + (i === sel ? ' selected' : ''), onClick: () => void choose(i) },
          h('div', { class: 'txt' }, it.text + (it.truncated ? '…' : ''))
        )
      );
    });
    list.children[sel]?.scrollIntoView({ block: 'nearest' });
  }

  async function load(): Promise<void> {
    items = (await api.clipList(search.value)).slice(0, 50);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    render();
  }

  search.addEventListener('input', () => {
    sel = 0;
    void load();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      void api.pickerHide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      sel = Math.min(sel + 1, Math.max(0, items.length - 1));
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sel = Math.max(sel - 1, 0);
      render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void choose(sel);
    }
  });

  void listen('picker-open', () => {
    search.value = '';
    sel = 0;
    void load();
    search.focus();
  });
  void load();
  search.focus();
}
