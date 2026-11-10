import { icon, type IconName } from '../../../design/icons';
import { MODULE_FLAGS_KEY } from '../../core/module-state';
import { categories, routeCategory } from '../../core/ui-visibility';

export const AYARLAR_ANCHORS = new Set([
  'modules-section',
  'shortcuts-panel',
  'theme-section',
  'storage-section',
  'backup-section',
  'backup-download'
]);

/** Ayarlar sayfası içi bağlantıların (data-ayarlar-anchor) tıklamalarını bağlar. */
export function initAyarlarAnchors(): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-ayarlar-anchor]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const targetId = link.dataset.ayarlarAnchor!;
      document.querySelectorAll<HTMLElement>('[data-ayarlar-anchor]').forEach(a => {
        a.classList.toggle('active', a === link);
      });
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/** İlk yüklemede URL hash'ine göre kaydırma / yedek indirme tetikleme. */
export function scrollToInitialHash(): void {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'backup-download') {
    (document.getElementById('backup-section') ?? document.body).scrollIntoView();
    (document.getElementById('backup-download') as HTMLButtonElement | null)?.click();
  } else if (hash && AYARLAR_ANCHORS.has(hash)) {
    document.getElementById(hash)?.scrollIntoView();
  }
}

const pageHeadingIcons: Record<string, IconName> = {
  'notlar-heading': 'notebook-pen',
  'gorevler-heading': 'list-checks',
  'metin-heading': 'text-cursor-input',
  'sekmeler-heading': 'layout-grid',
  'odak-heading': 'timer',
  'medya-heading': 'clapperboard',
  'ayarlar-heading': 'settings'
};

const ALL_CATEGORIES = ['notlar', 'gorevler', 'metin', 'sekmeler', 'odak', 'medya', 'ayarlar'] as const;

/** Başlık ikonları, kategori yönlendirme, "/" kısayolu ve hash dinleyicilerini bağlar. */
export function initNavigation(memoSection: HTMLElement, smartSection: HTMLElement): void {
  let activeCategory = 'notlar';

  for (const [id, name] of Object.entries(pageHeadingIcons)) {
    const h = document.getElementById(id);
    if (h) h.prepend(icon(name, 20), ' ');
  }

  const nav = document.getElementById('navigation')!;
  async function route(): Promise<void> {
    const flags = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
    const visible = categories(flags);
    const rawHash = location.hash.replace(/^#/, '');
    const normalizedHash = AYARLAR_ANCHORS.has(rawHash) ? '#ayarlar' : location.hash;
    const active = routeCategory(normalizedHash, visible);
    activeCategory = active;
    nav.replaceChildren();
    for (const category of visible) {
      const a = document.createElement('a');
      a.href = `#${category.id}`;
      a.title = category.label;
      a.setAttribute('aria-label', category.label);
      if (category.id === active) a.setAttribute('aria-current', 'page');
      a.className = (category.id === active ? 'active' : '') + (category.id === 'ayarlar' ? ' nav-settings' : '');
      const label = document.createElement('span');
      label.className = 'nav-tooltip';
      label.setAttribute('aria-hidden', 'true');
      label.textContent = category.label;
      a.append(icon(category.icon, 18), label);
      nav.append(a);
    }
    for (const category of ALL_CATEGORIES) {
      const el = document.getElementById(category);
      if (!el) continue;
      el.hidden = category !== active;
      el.style.display = category === active ? '' : 'none';
    }
    if (AYARLAR_ANCHORS.has(rawHash) && rawHash !== 'backup-download') {
      document.getElementById(rawHash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
    if (activeCategory === 'notlar' && !memoSection.hidden) {
      const search = document.querySelector<HTMLInputElement>('#memo-search');
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
    } else if (activeCategory === 'metin' && !smartSection.hidden) {
      const search = document.querySelector<HTMLInputElement>('#snippet-search');
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
    }
  });

  window.addEventListener('hashchange', () => void route());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MODULE_FLAGS_KEY]) void route();
  });
  void route();
}
