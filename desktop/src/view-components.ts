import { icon, type IconName } from '../../design/icons';
import clipboardArt from '../../design/assets/empty-states/empty-clipboard.svg?raw';
import notesArt from '../../design/assets/empty-states/empty-notes.svg?raw';
import watchlistArt from '../../design/assets/empty-states/empty-watchlist.svg?raw';
import { h } from './dom';

const ART = { clipboard: clipboardArt, notes: notesArt, watchlist: watchlistArt } as const;
export type EmptyArt = keyof typeof ART;

/** Boş durum çizimi: sabit, paketle gelen SVG; renk currentColor ile temadan gelir. */
function art(name: EmptyArt): Element {
  const doc = new DOMParser().parseFromString(ART[name], 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  svg.setAttribute('class', 'empty-art');
  return svg;
}

/** Küçük pencerelerin (seçiciler, hızlı not) başlık satırı. */
export function miniHeader(iconName: IconName, title: string): HTMLElement {
  return h('div', { class: 'mini-head' }, h('span', { class: 'mini-head-icon' }, icon(iconName, 16)), h('span', { class: 'mini-head-title' }, title));
}

/** Küçük pencerelerin alt satırı: tuş ipuçları. */
export function miniFooter(keys: [string, string][]): HTMLElement {
  return h('div', { class: 'mini-foot' }, ...keys.map(([key, label]) => h('span', {}, h('kbd', {}, key), ' ' + label)));
}

export function emptyState(title: string, hint: string, illustration?: EmptyArt): HTMLElement {
  return h('div', { class: 'empty-state' }, ...(illustration ? [art(illustration)] : []), h('p', { class: 'empty-title' }, title), h('p', { class: 'empty-hint muted' }, hint));
}

function closeMenus(): void {
  document.querySelectorAll<HTMLElement>('.kebab-popover').forEach((el) => { el.hidden = true; el.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
}

document.addEventListener('click', closeMenus);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });

export function rowMenu(actions: { label: string; run: () => void | Promise<void>; danger?: boolean }[]): HTMLElement {
  const popover = h('div', { class: 'card kebab-popover', hidden: true });
  const toggle = h('button', { type: 'button', class: 'icon-button', title: 'İşlemler', 'aria-label': 'İşlemler', 'aria-expanded': 'false' }, icon('ellipsis', 18));
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
