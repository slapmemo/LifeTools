import { icon } from '../../../design/icons';
import { h } from '../dom';
import type { RouteId } from '../app';

interface WelcomeCard {
  route: RouteId;
  icon: Parameters<typeof icon>[0];
  title: string;
  description: string;
  action: string;
  shortcut?: string;
}

const CARDS: readonly WelcomeCard[] = [
  { route: 'notlar', icon: 'notebook-pen', title: 'Notlarını sakla', description: 'Fikirlerini, okunacakları ve hatırlatmaları tek yerde tut.', action: 'Notlara git', shortcut: 'Ctrl + Alt + N · Hızlı not' },
  { route: 'sablonlar', icon: 'message-square-text', title: 'Yazmayı hızlandır', description: 'Sık kullandığın metinleri kaydet, istediğin uygulamada yapıştır.', action: 'Şablonları gör', shortcut: 'Ctrl + Shift + Space · Şablon seçici' },
  { route: 'pano', icon: 'clipboard', title: 'Panonu geri bul', description: 'Kopyaladığın metinlere göz at, ara ve yeniden kopyala.', action: 'Pano geçmişini aç', shortcut: 'Ctrl + Alt + V · Pano seçici' },
  { route: 'izleme', icon: 'clapperboard', title: 'İzleme listeni oluştur', description: 'Film, dizi ve videoları izleyeceklerin arasında takip et.', action: 'İzleme listesine git' },
  { route: 'ayarlar', icon: 'link', title: 'Chrome ile bağla', description: 'Eklenti verilerini masaüstüne aktarıp tarayıcı özetini ve notlarını burada gör.', action: 'Bağlantı ayarlarını aç' }
];

export function mount(container: HTMLElement, navigate: (route: RouteId) => void): void {
  const cards = CARDS.map((item) => h('article', { class: 'welcome-card' },
    h('span', { class: 'welcome-card-icon' }, icon(item.icon, 21)),
    h('div', { class: 'welcome-card-copy' },
      h('h3', {}, item.title),
      h('p', {}, item.description),
      item.shortcut ? h('span', { class: 'welcome-shortcut' }, icon('keyboard', 14), item.shortcut) : null),
    h('button', { type: 'button', class: 'link-button welcome-card-action', onClick: () => navigate(item.route) }, item.action, icon('arrow-right', 15))));

  const start = h('button', { type: 'button', class: 'primary welcome-start', onClick: () => navigate('anasayfa') }, 'Uygulamaya başla', icon('arrow-right', 16));
  container.replaceChildren(h('section', { class: 'welcome-page', 'aria-labelledby': 'welcome-title' },
    h('div', { class: 'welcome-hero card' },
      h('div', { class: 'welcome-hero-copy' },
        h('p', { class: 'page-eyebrow' }, 'LIFETOOLS · MASAÜSTÜ'),
        h('h1', { id: 'welcome-title' }, 'Hoş geldin.'),
        h('p', { class: 'welcome-lede' }, 'Günlük işlerini hızlandıracak araçların burada. Başlamak için birini seçebilir ya da doğrudan uygulamaya geçebilirsin.'),
        start),
      h('div', { class: 'welcome-keys', 'aria-label': 'Varsayılan klavye kısayolları' },
        h('span', { class: 'welcome-keys-label' }, 'Hızlı erişim · varsayılan kısayollar'),
        ...CARDS.filter((item) => item.shortcut).map((item) => h('div', { class: 'welcome-key-row' },
          h('span', {}, item.title), h('kbd', {}, item.shortcut!.split(' · ')[0]))))),
    h('div', { class: 'welcome-section-head' }, h('h2', {}, 'Nereden başlayalım?'), h('p', {}, 'Kısayolları Ayarlar’dan değiştirebilirsin.')),
    h('div', { class: 'welcome-grid' }, ...cards),
    h('p', { class: 'welcome-footnote' }, 'İpucu: Sol menüden bu bölümlere istediğin zaman geri dönebilirsin.')));
}
