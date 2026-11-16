import { listen } from '@tauri-apps/api/event';
import { icon } from '../../design/icons';
import { api, type ClipItem } from './api';
import { fmtTime, h } from './dom';
import { miniFooter, miniHeader } from './view-components';

export function mountPicker(root: HTMLElement): void {
  const search = h('input', { type: 'search', placeholder: 'Pano geçmişinde ara…', 'aria-label': 'Pano geçmişinde ara' });
  const list = h('div', { class: 'picker-list', role: 'listbox', 'aria-label': 'Pano kayıtları' });
  root.append(h('div', { class: 'picker' },
    miniHeader('clipboard', 'Pano geçmişi'),
    h('label', { class: 'search-field' }, icon('search', 16), search),
    list,
    miniFooter([['↑↓', 'seç'], ['Enter', 'kopyala'], ['Esc', 'kapat']])));

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
      list.append(h('div', { class: 'empty' }, search.value ? 'Sonuç yok.' : 'Kayıt yok.'));
      return;
    }
    items.forEach((it, i) => {
      const isLink = /^https?:\/\/\S+$/.test(it.text.trim());
      list.append(
        h(
          'div',
          { class: 'picker-row' + (i === sel ? ' selected' : ''), role: 'option', 'aria-selected': String(i === sel), onClick: () => void choose(i) },
          h('span', { class: 'picker-row-icon' }, icon(isLink ? 'link' : it.pinned ? 'pin' : 'file-text', 14)),
          h('div', { class: 'picker-row-main' },
            h('div', { class: 'picker-row-title clamp-1' }, it.text.replace(/\s+/g, ' ') + (it.truncated ? '…' : '')),
            h('div', { class: 'picker-row-meta' }, fmtTime(it.created_at)))
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
