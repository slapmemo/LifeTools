import { api, errText, type Electricity, type Estimate } from '../api';
import { debounce, h, parseNum, type View } from '../dom';

const PRESETS: [string, number][] = [
  ['CPU', 65],
  ['GPU', 150],
  ['Monitör', 30],
  ['Diğer', 20]
];

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

export function electricityView(): View {
  let data: Electricity = { components: [], hours: 8, price: null };
  const rows = h('div', { class: 'comp-list' });
  const hours = h('input', { type: 'text', inputMode: 'decimal', size: 6 });
  const price = h('input', { type: 'text', inputMode: 'decimal', size: 8, placeholder: 'ör. 2,50' });
  const result = h('div', { class: 'electricity-results' });
  const presetBar = h('div', { class: 'toolbar' });

  const el = h(
    'section',
    {},
    h('h2', {}, 'PC elektrik tüketimi tahmini'),
    h(
      'p',
      { class: 'banner' },
      'Bu değerler yalnızca tahmindir. Gerçek tüketim yük durumuna göre değişir; kesin sonuç için prize takılan bir watt ölçer gerekir.'
    ),
    h(
      'div', { class: 'electricity-layout' },
      h('div', { class: 'card electricity-form' },
        h('h3', {}, 'Bileşenler (tahmini watt)'), rows, presetBar,
        h('div', { class: 'electricity-fields' },
          h('label', { class: 'field' }, 'Günlük kullanım (saat)', hours),
          h('label', { class: 'field' }, 'Birim fiyat (TL/kWh)', price))),
      h('div', { class: 'card electricity-result-card' }, h('h3', {}, 'Tahmini tüketim ve tutar'), result)
    ),
  );

  const save = debounce(() => void api.elecSave(data).catch(() => undefined), 400);

  async function recalc(): Promise<void> {
    result.replaceChildren();
    try {
      const e: Estimate = await api.elecEstimate(data);
      const line = (label: string, kwh: number, tl: number) =>
        h('div', { class: 'electricity-result-row' }, h('span', {}, label),
          h('span', { class: 'muted' }, `${nf.format(kwh)} kWh`), h('strong', {}, `${nf.format(tl)} TL`));
      result.append(
          line('Günlük', e.daily_kwh, e.daily_tl),
          line('Aylık (30 gün)', e.monthly_kwh, e.monthly_tl),
          line('Yıllık (365 gün)', e.yearly_kwh, e.yearly_tl)
      );
    } catch (err) {
      result.append(h('div', { class: 'muted' }, errText(err)));
    }
  }

  function changed(): void {
    save();
    void recalc();
  }

  function renderRows(): void {
    rows.replaceChildren();
    data.components.forEach((c, i) => {
      const name = h('input', { type: 'text', value: c.name, class: 'grow', 'aria-label': 'Bileşen adı' });
      const watts = h('input', { type: 'text', inputMode: 'decimal', value: String(c.watts), size: 6, 'aria-label': 'Güç (W)' });
      name.addEventListener('input', () => {
        c.name = name.value;
        changed();
      });
      watts.addEventListener('input', () => {
        c.watts = parseNum(watts.value);
        changed();
      });
      rows.append(
        h(
          'div',
          { class: 'toolbar' },
          name,
          watts,
          h('span', { class: 'muted' }, 'W'),
          h(
            'button',
            {
              class: 'small danger',
              onClick: () => {
                data.components.splice(i, 1);
                renderRows();
                changed();
              }
            },
            'Sil'
          )
        )
      );
    });
  }

  for (const [name, watts] of PRESETS) {
    presetBar.append(
      h(
        'button',
        {
          class: 'small',
          onClick: () => {
            data.components.push({ name, watts });
            renderRows();
            changed();
          }
        },
        `+ ${name}`
      )
    );
  }

  hours.addEventListener('input', () => {
    data.hours = parseNum(hours.value);
    changed();
  });
  price.addEventListener('input', () => {
    data.price = price.value.trim() === '' ? null : parseNum(price.value);
    changed();
  });

  return {
    el,
    refresh: async () => {
      data = await api.elecGet();
      hours.value = String(data.hours);
      price.value = data.price === null ? '' : String(data.price).replace('.', ',');
      renderRows();
      await recalc();
    }
  };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = electricityView();
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
