import { listen } from '@tauri-apps/api/event';
import { icon } from '../../design/icons';
import { h } from './dom';

export function mountToast(root: HTMLElement): void {
  const text = h('span', { class: 'toast-text clamp-2' });
  const box = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'toast-icon' }, icon('bell', 16)), text);
  root.append(box);
  void listen<string>('toast', (e) => {
    text.textContent = e.payload;
  });
}
