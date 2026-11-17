import { icon, type IconName } from '../../../design/icons';
import { api, errText, type DashboardSummary } from '../api';
import { ambient } from '../ambient';
import { fmtTime, h } from '../dom';
import { emptyState } from '../view-components';
import { toggleFromTray } from './ortam';
import type { RouteId } from '../app';
import { isOn } from '../feature-state';

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 23) return 'İyi akşamlar';
  return 'İyi geceler';
}

export function fmtDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return '1 dk altı';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} sa ${minutes % 60} dk` : `${minutes} dk`;
}

/** Eklentinin sakladığı site ikonu (yalnızca data:image/ — Rust tarafı da süzer). Yüklenemezse genel ekran ikonuna döner. */
function siteIcon(src: string): HTMLElement {
  const img = h('img', { class: 'site-favicon', src, alt: '', width: 22, height: 22 });
  img.addEventListener('error', () => img.replaceWith(icon('monitor', 22)));
  return img;
}

export function mount(container: HTMLElement, navigate: (route: RouteId) => void): void {
  const now = new Date();
  const subtitle = h('p', { class: 'page-subtitle' }, 'Günün özeti burada.');
  const header = h('header', { class: 'page-header' },
    h('p', { class: 'page-eyebrow' }, now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })),
    h('h2', { class: 'page-title page-title-display' }, `${greeting(now.getHours())}!`),
    subtitle);
  const body = h('div', { class: 'dash' }, emptyState('Yükleniyor…', ''));
  container.replaceChildren(h('section', {}, header, body));

  const linkHead = (title: string, iconName: IconName, route: RouteId) => h('div', { class: 'panel-head' },
    h('h3', { class: 'panel-title' }, icon(iconName, 18), title),
    h('button', { type: 'button', class: 'link-button panel-link', onClick: () => navigate(route) }, 'Tümünü gör', icon('arrow-right', 14)));

  const stat = (iconName: IconName | HTMLElement, label: string, value: string, meta: string, route?: RouteId, extra?: HTMLElement) => {
    const children = [
      h('span', { class: 'stat-icon' }, typeof iconName === 'string' ? icon(iconName, 22) : iconName),
      h('div', { class: 'stat-text' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value clamp-1' }, value), h('span', { class: 'stat-meta clamp-1' }, meta))
    ];
    const card = route
      ? h('div', { class: 'card stat-card interactive', role: 'link', tabIndex: 0, onClick: () => navigate(route), onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') navigate(route); } }, ...children)
      : h('div', { class: 'card stat-card' }, ...children);
    if (extra) card.append(extra);
    return card;
  };

  function ambientCard(): HTMLElement {
    const active = Object.values(ambient.config.channels).filter((channel) => channel.on).length;
    const button = h('button', {
      type: 'button', class: 'primary round-button',
      title: ambient.playing ? 'Durdur' : 'Çal', 'aria-label': ambient.playing ? 'Ortam sesini durdur' : 'Ortam sesini çal',
      onClick: async (e: Event) => { e.stopPropagation(); await toggleFromTray(); card.replaceWith(ambientCard()); }
    }, icon(ambient.playing ? 'pause' : 'play', 16));
    const card = stat('audio-lines', 'Ortam sesi', ambient.playing ? 'Çalıyor' : 'Çalmıyor', active ? `${active} etkin ses` : 'Etkin ses yok', 'ortam', button);
    return card;
  }

  function render(s: DashboardSummary): void {
    const top = s.sites[0];
    const battery = [...s.batteries].filter((item) => item.percent !== null).sort((a, b) => a.percent! - b.percent!)[0] ?? s.batteries[0];
    if (s.sites_available && s.sites_total_seconds > 0) subtitle.textContent = `Bugün tarayıcıda ${fmtDuration(s.sites_total_seconds)} geçirdin.`;

    const stats = h('div', { class: 'stat-grid' },
      stat('clock-3', 'Bugün', s.sites_available ? fmtDuration(s.sites_total_seconds) : '—', s.sites_available ? 'Tarayıcıda geçen süre' : 'Eklenti bağlı değil'),
      stat(top?.icon ? siteIcon(top.icon) : 'monitor', 'En çok ziyaret edilen', top ? top.domain : '—', top ? fmtDuration(top.seconds) : 'Bugün site kaydı yok'),
      isOn('piller') && stat('battery-medium', 'Pil', battery ? (battery.percent === null ? battery.level_text || 'Bilinmiyor' : `%${battery.percent}`) : '—', battery ? battery.name : 'Pil bilgisi bulunamadı', 'piller'),
      isOn('ortam') && ambientCard());

    const notes = isOn('notlar') && h('div', { class: 'card panel' }, linkHead('Son notlar', 'notebook-pen', 'notlar'),
      !s.notes_available ? emptyState('Chrome eklentisi bağlı değil', 'Notlar eklentiden masaüstüne taşınınca burada görünür.')
        : s.notes.length ? h('div', { class: 'panel-list' }, ...s.notes.slice(0, 3).map((note) => h('div', { class: 'panel-row' },
          h('div', { class: 'panel-row-main' }, h('span', { class: 'panel-row-title clamp-1' }, note.title || 'Adsız not'), h('span', { class: 'panel-row-meta' }, fmtTime(note.updated_at))))))
          : emptyState('Henüz not yok', 'İlk notunu Notlar sayfasından ekleyebilirsin.', 'notes'));

    const clips = isOn('pano') && h('div', { class: 'card panel' }, linkHead('Son kopyalananlar', 'clipboard', 'pano'),
      s.clipboard.length ? h('div', { class: 'panel-list' }, ...s.clipboard.map((clip) => {
        const copy = h('button', { type: 'button', class: 'icon-button', title: 'Kopyala', 'aria-label': 'Kopyala' }, icon('copy', 16));
        copy.addEventListener('click', () => void api.clipCopy(clip.id).then(() => {
          copy.replaceChildren(icon('check', 16));
          window.setTimeout(() => copy.replaceChildren(icon('copy', 16)), 1200);
        }).catch(() => undefined));
        return h('div', { class: 'panel-row' },
          h('span', { class: 'panel-row-icon' }, icon(/^https?:\/\//.test(clip.preview) ? 'link' : 'file-text', 16)),
          h('div', { class: 'panel-row-main' }, h('span', { class: 'panel-row-title clamp-1' }, clip.preview.replace(/\s+/g, ' ')), h('span', { class: 'panel-row-meta' }, fmtTime(clip.created_at))),
          copy);
      })) : emptyState('Pano geçmişi boş', 'Kopyaladığın metinler burada görünür.', 'clipboard'));

    body.replaceChildren(stats, (notes || clips) ? h('div', { class: 'panel-grid' }, notes, clips) : '');
  }

  void api.dashboardSummary().then((s) => { if (body.isConnected) render(s); })
    .catch((error: unknown) => { if (body.isConnected) body.replaceChildren(emptyState('Özet yüklenemedi', errText(error))); });
}
