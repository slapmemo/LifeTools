import { api, errText, type DeviceBattery } from './api';
import { h, type View } from './dom';

const REFRESH_MS = 5 * 60 * 1000;

export function batteriesView(): View {
  const list = h('div', { class: 'list' });
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
      list.append(h('div', { class: 'empty' }, "Windows'un pil düzeyi bildirdiği aygıt bulunamadı."));
      return;
    }
    for (const d of items) {
      const low = d.percent < 20 && d.charging !== true;
      const fill = h('div', { class: 'bar-fill' + (low ? ' low' : '') });
      fill.style.width = `${d.percent}%`;
      list.append(
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'txt' }, d.name, h('div', { class: 'muted' }, d.kind === 'system' ? 'Sistem' : 'Bluetooth')),
          h(
            'div',
            { class: 'meta batt' },
            h('div', { class: 'bar' }, fill),
            h('strong', {}, `%${d.percent}`),
            d.charging === true ? h('span', { class: 'muted' }, 'şarj oluyor') : null
          )
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
