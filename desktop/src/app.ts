import '../../design/tokens.css';
import '../../design/components.css';
import { listen } from '@tauri-apps/api/event';
import { icon, type IconName } from '../../design/icons';
import logoDark from '../../design/logo/LifeTools_koyu_tema.svg?url';
import logoLight from '../../design/logo/LifeTools_acik_tema.svg?url';
import { h } from './dom';
import * as ayarlar from './views/ayarlar';
import * as anasayfa from './views/anasayfa';
import * as izleme from './views/izleme';
import * as notlar from './views/notlar';
import * as ortam from './views/ortam';
import * as pano from './views/pano';
import * as piller from './views/piller';
import * as sablonlar from './views/sablonlar';

export type RouteId = 'anasayfa' | 'notlar' | 'izleme' | 'sablonlar' | 'pano' | 'ortam' | 'piller' | 'ayarlar';
interface NavItem { id: RouteId; label: string; icon: IconName; }
interface SectionModule { mount: (container: HTMLElement) => void; unmount?: () => void; refresh?: () => Promise<void> | void; }

const TOP_ITEMS: NavItem[] = [
  { id: 'anasayfa', label: 'Ana sayfa', icon: 'home' },
  { id: 'notlar', label: 'Notlar', icon: 'notebook-pen' },
  { id: 'izleme', label: 'İzleme listesi', icon: 'clapperboard' },
  { id: 'sablonlar', label: 'Şablonlar', icon: 'message-square-text' },
  { id: 'pano', label: 'Pano', icon: 'clipboard' },
  { id: 'ortam', label: 'Ortam sesi', icon: 'headphones' }
];
const OTHER_ITEMS: NavItem[] = [
  { id: 'piller', label: 'Piller', icon: 'battery-medium' }
];
const BOTTOM_ITEM: NavItem = { id: 'ayarlar', label: 'Ayarlar', icon: 'settings' };

const ROUTE_ALIASES: Record<string, RouteId> = {
  home: 'anasayfa', 'ana-sayfa': 'anasayfa', anasayfa: 'anasayfa',
  notes: 'notlar', notlar: 'notlar',
  watchlist: 'izleme', 'izleme-listesi': 'izleme', izleme: 'izleme',
  snippets: 'sablonlar', sablonlar: 'sablonlar', clipboard: 'pano', pano: 'pano',
  ambient: 'ortam', ortam: 'ortam',
  batteries: 'piller', piller: 'piller',
  settings: 'ayarlar', ayarlar: 'ayarlar'
};

const OTHER_COLLAPSED_KEY = 'lifetools_other_collapsed';
function readOtherCollapsed(): boolean {
  try { return localStorage.getItem(OTHER_COLLAPSED_KEY) === '1'; } catch { return false; }
}
function writeOtherCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(OTHER_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* yoksay */ }
}

export function mountMain(root: HTMLElement): void {
  const views: Record<RouteId, SectionModule> = {
    anasayfa: { mount: (container) => anasayfa.mount(container, show) },
    notlar,
    izleme,
    sablonlar, pano, ortam, piller, ayarlar
  };

  const buttons = new Map<RouteId, HTMLButtonElement>();
  let current: RouteId = 'anasayfa';
  let otherCollapsed = readOtherCollapsed();
  let manualSidebarCollapsed: boolean | null = null;
  const isNarrow = () => window.matchMedia('(max-width: 1000px)').matches || window.innerWidth < 1000;
  let lastNarrow = isNarrow();

  const makeNavBtn = (item: NavItem): HTMLButtonElement => {
    const btn = h('button', { type: 'button', class: 'navbtn', title: item.label, 'data-route': item.id, onClick: () => show(item.id) }, icon(item.icon, 18), h('span', { class: 'nav-label' }, item.label));
    buttons.set(item.id, btn);
    return btn;
  };

  const isSidebarCollapsed = (): boolean => manualSidebarCollapsed !== null ? manualSidebarCollapsed : isNarrow();
  const toggleBtn = h('button', { type: 'button', class: 'icon-button sidebar-toggle', title: 'Kenar çubuğunu daralt veya genişlet', 'aria-label': 'Kenar çubuğunu daralt veya genişlet', onClick: () => { manualSidebarCollapsed = !isSidebarCollapsed(); syncSidebar(); } }, icon('panel-left', 18));
  const brand = h('div', { class: 'brand' },
    h('img', { class: 'brand-mark brand-mark-light', src: logoLight, alt: '' }),
    h('img', { class: 'brand-mark brand-mark-dark', src: logoDark, alt: '' }),
    h('span', { class: 'brand-label' }, 'LifeTools'));
  const header = h('div', { class: 'sidebar-header' }, brand, toggleBtn);
  const topGroup = h('div', { class: 'nav-top' }, ...TOP_ITEMS.map(makeNavBtn));
  const otherItemsBox = h('div', { class: 'nav-group-items' }, ...OTHER_ITEMS.map(makeNavBtn));
  const otherToggleBtn = h('button', { type: 'button', class: 'navbtn nav-group-toggle', title: 'Diğer', 'aria-expanded': String(!otherCollapsed), onClick: () => { otherCollapsed = !otherCollapsed; writeOtherCollapsed(otherCollapsed); syncOtherGroup(); } }, icon('ellipsis', 18), h('span', { class: 'nav-label' }, 'Diğer'), h('span', { class: 'nav-chevron' }, icon('chevron-down', 14)));
  const otherGroup = h('div', { class: 'nav-group' }, otherToggleBtn, otherItemsBox);
  const bottomGroup = h('div', { class: 'sidebar-bottom' }, makeNavBtn(BOTTOM_ITEM));
  const nav = h('nav', { class: 'sidebar', 'aria-label': 'Ana menü' }, header, topGroup, otherGroup, bottomGroup);
  const content = h('main', { class: 'content' });

  function syncSidebar(): void {
    const collapsed = isSidebarCollapsed();
    nav.classList.toggle('collapsed', collapsed);
    nav.classList.toggle('expanded', !collapsed);
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
  }
  function syncOtherGroup(): void {
    otherItemsBox.hidden = otherCollapsed;
    otherToggleBtn.classList.toggle('collapsed', otherCollapsed);
    otherToggleBtn.setAttribute('aria-expanded', String(!otherCollapsed));
  }
  function show(id: RouteId): void {
    if (current !== id) views[current]?.unmount?.();
    current = id;
    if (OTHER_ITEMS.some((it) => it.id === id) && otherCollapsed) {
      otherCollapsed = false;
      writeOtherCollapsed(false);
      syncOtherGroup();
    }
    for (const [sid, btn] of buttons) {
      const active = sid === id;
      btn.classList.toggle('active', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    }
    views[id].mount(content);
  }

  window.addEventListener('resize', () => {
    const narrow = isNarrow();
    if (narrow !== lastNarrow) { lastNarrow = narrow; manualSidebarCollapsed = null; }
    syncSidebar();
  });

  syncSidebar();
  syncOtherGroup();
  root.append(h('div', { class: 'shell' }, nav, content));
  show('anasayfa');

  void listen<string>('navigate', (e) => { const t = ROUTE_ALIASES[e.payload]; if (t) show(t); });
  void listen('ambient-toggle', () => void ortam.toggleFromTray());
  void listen('clipboard-changed', () => { if (current === 'pano') void pano.refresh(); });
  void listen('notes-changed', () => { if (current === 'notlar') void notlar.refresh(); });
}
