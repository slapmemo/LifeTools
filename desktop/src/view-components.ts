import { icon } from '../../design/icons';
import { h } from './dom';

export function emptyState(title: string, hint: string): HTMLElement {
  return h('div', { class: 'empty-state' }, h('p', { class: 'empty-title' }, title), h('p', { class: 'empty-hint muted' }, hint));
}

function closeMenus(): void {
  document.querySelectorAll<HTMLElement>('.kebab-popover').forEach((el) => { el.hidden = true; el.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
}

document.addEventListener('click', closeMenus);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });

export function rowMenu(actions: { label: string; run: () => void | Promise<void>; danger?: boolean }[]): HTMLElement {
  const popover = h('div', { class: 'card kebab-popover', hidden: true });
  const toggle = h('button', { type: 'button', class: 'icon-button', title: '??lemler', 'aria-label': '??lemler', 'aria-expanded': 'false' }, icon('ellipsis', 18));
  const menu = h('div', { class: 'kebab-menu', onClick: (e: Event) => e.stopPropagation() }, toggle, popover);
  toggle.addEventListener('click', () => {
    const opening = popover.hidden;
    closeMenus();
    popover.hidden = !opening;
    toggle.setAttribute('aria-expanded', String(opening));
  });
  for (const action of actions) {
    let timer: number | undefined;
    const button = h('button', { type: 'button', class: 'kebab-item' + (action.danger ? ' danger' : '') }, action.label);
    button.addEventListener('click', () => {
      if (action.danger && timer === undefined) {
        button.textContent = 'Emin misin?';
        button.classList.add('confirming');
        timer = window.setTimeout(() => { timer = undefined; button.textContent = action.label; button.classList.remove('confirming'); }, 3000);
        return;
      }
      window.clearTimeout(timer);
      timer = undefined;
      popover.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      void action.run();
    });
    popover.append(button);
  }
  return menu;
}
