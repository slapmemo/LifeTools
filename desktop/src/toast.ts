import { listen } from '@tauri-apps/api/event';
import { h } from './dom';

export function mountToast(root: HTMLElement): void {
  const box = h('div', { class: 'toast' });
  root.append(box);
  void listen<string>('toast', (e) => {
    box.textContent = e.payload;
  });
}
