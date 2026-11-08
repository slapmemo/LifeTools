import { api, errText, type DeviceBattery } from '../api';
import { h, type View } from '../dom';
import { icon } from '../../../design/icons';
import { emptyState } from '../view-components';

const REFRESH_MS = 5 * 60 * 1000;

export function batteriesView(): View {
  const list = h('div', { class: 'battery-grid' });
  const status = h('div', { class: 'muted status' });
  const el = h(
    'section',
    {},
    h('h2', {}, 'Cihaz pilleri'),
    h(
      'p',
      { class: 'muted' },
      "Yalnızca Windows'un bildirdiği değerler gösterilir; tahmin yapılmaz. 5 dakikada bir yenilenir. Pil %20 altına düşünce bildirim Ayarlar'dan kapatılabilir."
    ),
    h('div', { class: 'toolbar' }, h('button', { onClick: () => void refresh() }, 'Yenile')),
    status,
    list
  );

  function render(items: DeviceBattery[]): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(emptyState('Cihaz bulunamadı', "Windows'un pil düzeyi bildirdiği aygıt bulunamadı."));
      return;
    }
    for (const d of items) {
      const low = d.percent <= 20;
      const fill = h('div', { class: 'bar-fill' + (low ? ' low' : '') });
      fill.style.width = `${d.percent}%`;
      list.append(
        h(
          'div',
          { class: 'card battery-card' },
          h('div', { class: 'battery-heading' }, icon('battery-medium', 22),
            h('div', { class: 'grow' }, h('strong', {}, d.name), h('div', { class: 'muted' }, d.kind === 'system' ? 'Sistem' : 'Bluetooth')),
            h('strong', {}, `%${d.percent}`)),
          h('div', { class: 'bar battery-bar', role: 'progressbar', 'aria-label': `${d.name} pil düzeyi`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(d.percent) }, fill),
          d.charging === true ? h('div', { class: 'battery-charging' }, icon('zap', 14), 'Şarj oluyor') : null
        )
      );
    }
  }

  async function refresh(): Promise<void> {
    try {
      render(await api.batteryList());
      status.textContent = '';
    } catch (e) {
      status.textContent = errText(e);
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
