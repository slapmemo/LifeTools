import { api, errText } from '../api';
import { ambient } from '../ambient';
import { fmtTime, h } from '../dom';
import { emptyState } from '../view-components';
import type { RouteId } from '../app';

export function mount(container: HTMLElement, navigate: (route: RouteId) => void): void {
  const grid = h('div', { class: 'dashboard-grid' });
  container.replaceChildren(h('section', {}, h('h2', {}, 'Ana sayfa'), grid));
  const card = (title: string, children: HTMLElement[], route?: RouteId): HTMLElement => {
    const body = h('div', { class: 'dashboard-content' }, ...children);
    if (route) return h('button', { type: 'button', class: 'card dashboard-card dashboard-link', onClick: () => navigate(route) }, h('h3', {}, title), body);
    return h('div', { class: 'card dashboard-card' }, h('h3', {}, title), body);
  };
  const empty = (title: string, hint = '') => emptyState(title, hint);
  const row = (text: string) => h('div', { class: 'dashboard-row' }, text);
  grid.append(empty('Yükleniyor…'));
  void api.dashboardSummary().then((s) => {
    if (!grid.isConnected) return;
    const active = Object.values(ambient.config.channels).filter((channel) => channel.on).length;
    grid.replaceChildren(
      card('Görevler', !s.tasks_available ? [empty('Chrome eklentisi bağlı değil')] : [
        row(`${s.open_count} açık görev · ${s.overdue_count} gecikmiş`),
        ...(s.today_tasks.length ? s.today_tasks.map((task) => row(task.title)) : [empty('Bugün görev yok')])
      ]),
      card('Notlar', !s.notes_available ? [empty('Chrome eklentisi bağlı değil')] : s.notes.length ? s.notes.map((note) => row(`${note.title} · ${fmtTime(note.updated_at)}`)) : [empty('Henüz not yok')]),
      card('Bugün sitelerde', !s.sites_available ? [empty('Chrome eklentisi bağlı değil')] : s.sites.length ? s.sites.map((site) => row(`${site.domain} · ${Math.floor(site.seconds / 60)} dk`)) : [empty('Bugün site kaydı yok')]),
      card('Piller', s.batteries.length ? s.batteries.map((battery) => row(`${battery.name} · %${battery.percent}`)) : [empty('Pil bilgisi bulunamadı')], 'piller'),
      card('Son pano', s.clipboard.length ? s.clipboard.map((clip) => row(clip.preview)) : [empty('Pano geçmişi boş')], 'pano'),
      card('Ortam sesi', [row(ambient.playing ? `Çalıyor · ${active} etkin ses` : 'Çalmıyor'), ...(!active ? [empty('Etkin ses yok')] : [])], 'ortam')
    );
  }).catch((error: unknown) => { if (grid.isConnected) grid.replaceChildren(empty('Özet yüklenemedi', errText(error))); });
}
