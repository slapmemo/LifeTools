import { api, errText, type DeviceBattery } from '../api';
import { h, type View } from '../dom';
import { icon } from '../../../design/icons';
import { emptyState } from '../view-components';

const REFRESH_MS = 5 * 60 * 1000;

export function batteriesView(): View {
  const list = h('div', { class: 'battery-grid' });
  const status = h('div', { class: 'muted status' });
  const refreshBtn = h('button', { type: 'button', onClick: () => void refresh() }, icon('refresh-cw', 16), 'Yenile');
  const el = h(
    'section',
    {},
    h('header', { class: 'page-header page-header-row' },
      h('div', {},
        h('h2', { class: 'page-title page-title-icon' }, icon('battery-medium', 26), 'Cihaz pilleri'),
        h('p', { class: 'page-subtitle', title: "Pil %20 altına düşünce bildirim gelir; Ayarlar'dan kapatılabilir." },
          "Windows'un bildirdiği değerler; tahmin yok, 5 dakikada bir yenilenir.")),
      h('div', { class: 'page-actions' }, refreshBtn)),
    status,
    list,
    h(
      'p',
      { class: 'hint battery-hint' },
      "USB alıcılı (2.4 GHz) aygıtlar pil düzeyini Windows'a bildirmez. ATK/Compx yongalı fareler (ör. ATK A9) üreticinin protokolüyle okunur; diğer markalar (Razer, Logitech alıcıları vb.) şimdilik görünmez."
    )
  );

  function render(items: DeviceBattery[]): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(emptyState('Cihaz bulunamadı', 'Pil düzeyi okunabilen aygıt yok (Bluetooth aygıtı, dizüstü pili ya da desteklenen USB alıcılı fare). Fare uykudaysa bir kez oynatıp Yenile de.'));
      return;
    }
    for (const d of items) {
      const low = d.percent <= 20;
      const fill = h('div', { class: 'bar-fill' + (low ? ' low' : '') });
      fill.style.width = `${d.percent}%`;
      list.append(
        h(
          'div',
          { class: 'card battery-card' + (low ? ' low' : '') },
          h('div', { class: 'battery-heading' }, h('span', { class: 'panel-row-icon' }, icon('battery-medium', 18)),
            h('div', { class: 'grow' }, h('strong', { class: 'clamp-1' }, d.name), h('div', { class: 'muted battery-kind' }, d.kind === 'system' ? 'Sistem' : d.kind === 'wireless' ? 'USB alıcı' : 'Bluetooth')),
            h('span', { class: 'battery-percent' }, `%${d.percent}`)),
          h('div', { class: 'bar battery-bar', role: 'progressbar', 'aria-label': `${d.name} pil düzeyi`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(d.percent) }, fill),
          d.charging === true ? h('div', { class: 'battery-charging' }, icon('zap', 14), 'Şarj oluyor') : null
        )
      );
    }
  }

  async function refresh(): Promise<void> {
    refreshBtn.disabled = true;
    try {
      render(await api.batteryList());
      status.textContent = '';
    } catch (e) {
      status.textContent = errText(e);
    } finally {
      refreshBtn.disabled = false;
    }
  }

  window.setInterval(() => {
    if (document.body.contains(el)) void refresh();
  }, REFRESH_MS);

  return { el, refresh };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = batteriesView();
  return instance;
}

export function mount(container: HTMLElement): void {
  const v = ensureView();
  container.replaceChildren(v.el);
  void v.refresh();
}

export function unmount(): void {
  instance?.el.remove();
}

export function refresh(): Promise<void> | void {
  return ensureView().refresh();
}
