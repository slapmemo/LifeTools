import { listen } from '@tauri-apps/api/event';
import { api, errText, type Electricity, type Estimate, type PinnedWindow } from './api';
import { debounce, fmtTime, h, parseNum } from './dom';

type SectionId = 'clipboard' | 'windows' | 'electricity' | 'settings';
interface View {
  el: HTMLElement;
  refresh: () => Promise<void> | void;
}

const SECTIONS: [SectionId, string][] = [
  ['clipboard', 'Pano'],
  ['windows', 'Pencereler'],
  ['electricity', 'Elektrik'],
  ['settings', 'Ayarlar']
];

export function mountMain(root: HTMLElement): void {
  const views: Record<SectionId, View> = {
    clipboard: clipboardView(),
    windows: windowsView(),
    electricity: electricityView(),
    settings: settingsView()
  };
  const nav = h('nav', { class: 'sidebar' }, h('div', { class: 'brand' }, 'LifeTools'));
  const content = h('main', { class: 'content' });
  const buttons = new Map<SectionId, HTMLButtonElement>();
  let current: SectionId = 'clipboard';

  function show(id: SectionId): void {
    current = id;
    for (const [sid, btn] of buttons) btn.classList.toggle('active', sid === id);
    content.replaceChildren(views[id].el);
    void views[id].refresh();
  }

  for (const [id, label] of SECTIONS) {
    const btn = h('button', { class: 'navbtn', onClick: () => show(id) }, label);
    buttons.set(id, btn);
    nav.append(btn);
  }
  root.append(h('div', { class: 'shell' }, nav, content));
  show('clipboard');

  void listen<string>('navigate', (e) => {
    if (SECTIONS.some(([id]) => id === e.payload)) show(e.payload as SectionId);
  });
  void listen('clipboard-changed', () => {
    if (current === 'clipboard') void views.clipboard.refresh();
  });
  void listen('windows-changed', () => {
    if (current === 'windows') void views.windows.refresh();
  });
}

// ---------- Pano ----------

function clipboardView(): View {
  const search = h('input', { type: 'search', class: 'grow', placeholder: 'Panoda ara…' });
  const pauseBtn = h('button', {}, 'Duraklat');
  const clearBtn = h('button', { class: 'danger' }, 'Tümünü temizle');
  const banner = h('div', { class: 'banner' }, 'Pano kaydı duraklatıldı. Kopyaladıkların kaydedilmiyor.');
  const status = h('div', { class: 'muted status' });
  const list = h('div', { class: 'list' });
  const el = h(
    'section',
    {},
    h('h2', {}, 'Pano geçmişi'),
    h('div', { class: 'toolbar' }, search, pauseBtn, clearBtn),
    banner,
    status,
    list
  );

  let paused = false;
  let armed: number | undefined;
  let statusTimer: number | undefined;

  function flash(msg: string): void {
    status.textContent = msg;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (status.textContent = ''), 2500);
  }

  async function refresh(): Promise<void> {
    const [items, s] = await Promise.all([api.clipList(search.value), api.settingsGet()]);
    paused = s.paused;
    pauseBtn.textContent = paused ? 'Devam et' : 'Duraklat';
    banner.style.display = paused ? 'block' : 'none';
    list.replaceChildren();
    if (items.length === 0) {
      list.append(h('div', { class: 'empty' }, search.value ? 'Eşleşen kayıt yok.' : 'Henüz kayıt yok.'));
      return;
    }
    for (const it of items) {
      const pin = h(
        'button',
        {
          class: 'small',
          onClick: async (e: Event) => {
            e.stopPropagation();
            await api.clipPin(it.id, !it.pinned);
            await refresh();
          }
        },
        it.pinned ? 'Sabit ✓' : 'Sabitle'
      );
      const del = h(
        'button',
        {
          class: 'small danger',
          onClick: async (e: Event) => {
            e.stopPropagation();
            await api.clipDelete(it.id);
            await refresh();
          }
        },
        'Sil'
      );
      list.append(
        h(
          'div',
          {
            class: 'row' + (it.pinned ? ' pinned' : ''),
            title: 'Tıkla: panoya kopyala',
            onClick: async () => {
              try {
                await api.clipCopy(it.id);
                flash('Panoya kopyalandı.');
              } catch (e) {
                flash(errText(e));
              }
            }
          },
          h('div', { class: 'txt' }, it.text + (it.truncated ? '…' : '')),
          h('div', { class: 'meta' }, h('span', { class: 'muted' }, fmtTime(it.created_at)), pin, del)
        )
      );
    }
  }

  search.addEventListener('input', debounce(() => void refresh(), 150));
  pauseBtn.addEventListener('click', async () => {
    const s = await api.settingsGet();
    await api.settingsSet({ ...s, paused: !paused });
    await refresh();
  });
  clearBtn.addEventListener('click', async () => {
    if (armed === undefined) {
      clearBtn.textContent = 'Emin misin? Tekrar tıkla (sabitlenenler korunur)';
      armed = window.setTimeout(() => {
        armed = undefined;
        clearBtn.textContent = 'Tümünü temizle';
      }, 3000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    clearBtn.textContent = 'Tümünü temizle';
    const n = await api.clipClear();
    flash(`${n} kayıt silindi.`);
    await refresh();
  });

  return { el, refresh };
}

// ---------- Pencereler ----------

function windowsView(): View {
  const list = h('div', { class: 'list' });
  const releaseAll = h('button', { class: 'danger' }, 'Tümünü bırak');
  const el = h(
    'section',
    {},
    h('h2', {}, 'Üstte tutulan pencereler'),
    h(
      'p',
      { class: 'muted' },
      'Herhangi bir pencerede Ctrl+Alt+T ile o pencereyi üstte tut / bırak. Tepsi menüsünden de yapılabilir.'
    ),
    h('div', { class: 'toolbar' }, releaseAll),
    list
  );

  function render(items: PinnedWindow[]): void {
    list.replaceChildren();
    if (items.length === 0) {
      list.append(h('div', { class: 'empty' }, 'Üstte tutulan pencere yok.'));
      return;
    }
    for (const w of items) {
      list.append(
        h(
          'div',
          { class: 'row' },
          h('div', { class: 'txt' }, w.title || '(başlıksız)', h('div', { class: 'muted' }, w.exe)),
          h(
            'div',
            { class: 'meta' },
            h('button', { class: 'small', onClick: async () => render(await api.windowsRelease(w.hwnd)) }, 'Kaldır')
          )
        )
      );
    }
  }

  releaseAll.addEventListener('click', async () => render(await api.windowsReleaseAll()));
  return { el, refresh: async () => render(await api.windowsList()) };
}

// ---------- Elektrik ----------

const PRESETS: [string, number][] = [
  ['CPU', 65],
  ['GPU', 150],
  ['Monitör', 30],
  ['Diğer', 20]
];

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function electricityView(): View {
  let data: Electricity = { components: [], hours: 8, price: null };
  const rows = h('div', { class: 'comp-list' });
  const hours = h('input', { type: 'text', inputMode: 'decimal', size: 6 });
  const price = h('input', { type: 'text', inputMode: 'decimal', size: 8, placeholder: 'ör. 2,50' });
  const result = h('div', { class: 'result' });
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
    h('h3', {}, 'Bileşenler (tahmini watt)'),
    rows,
    presetBar,
    h(
      'div',
      { class: 'form-row' },
      h('label', {}, 'Günlük kullanım (saat) ', hours),
      h('label', {}, 'Birim fiyat (TL/kWh) ', price)
    ),
    result
  );

  const save = debounce(() => void api.elecSave(data).catch(() => undefined), 400);

  async function recalc(): Promise<void> {
    result.replaceChildren();
    try {
      const e: Estimate = await api.elecEstimate(data);
      const line = (label: string, kwh: number, tl: number) =>
        h('tr', {}, h('th', {}, label), h('td', {}, `${nf.format(kwh)} kWh`), h('td', {}, `${nf.format(tl)} TL`));
      result.append(
        h(
          'table',
          {},
          h('tr', {}, h('th', {}, ''), h('th', {}, 'Tüketim'), h('th', {}, 'Tutar')),
          line('Günlük', e.daily_kwh, e.daily_tl),
          line('Aylık (30 gün)', e.monthly_kwh, e.monthly_tl),
          line('Yıllık (365 gün)', e.yearly_kwh, e.yearly_tl)
        )
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
      const name = h('input', { type: 'text', value: c.name, class: 'grow' });
      const watts = h('input', { type: 'text', inputMode: 'decimal', value: String(c.watts), size: 6 });
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

// ---------- Ayarlar ----------

function settingsView(): View {
  const autostart = h('input', { type: 'checkbox' });
  const expire = h('input', { type: 'number', min: '1', max: '365' });
  const max = h('input', { type: 'number', min: '10', max: '5000' });
  const excl = h('textarea', { rows: 6, class: 'grow' });
  const msg = h('div', { class: 'muted' });
  const saveBtn = h('button', {}, 'Kaydet');

  const el = h(
    'section',
    {},
    h('h2', {}, 'Ayarlar'),
    h('label', { class: 'check' }, autostart, ' Windows açılışında başlat'),
    h('h3', {}, 'Pano geçmişi'),
    h('div', { class: 'form-row' }, h('label', {}, 'Sabitlenmemiş kayıtlar şu kadar gün sonra silinir: ', expire)),
    h('div', { class: 'form-row' }, h('label', {}, 'En fazla kayıt sayısı (sabitlenenler hariç): ', max)),
    h('label', {}, 'Kaydedilmeyecek uygulamalar (her satıra bir exe adı):'),
    excl,
    h('div', { class: 'toolbar' }, saveBtn, msg),
    h('h3', {}, 'Kısayollar'),
    h('ul', {}, h('li', {}, 'Ctrl+Shift+V — pano seçici'), h('li', {}, 'Ctrl+Alt+T — etkin pencereyi üstte tut / bırak'))
  );

  autostart.addEventListener('change', async () => {
    try {
      autostart.checked = await api.autostartSet(autostart.checked);
    } catch (e) {
      msg.textContent = errText(e);
    }
  });
  saveBtn.addEventListener('click', async () => {
    try {
      const s = await api.settingsGet();
      const saved = await api.settingsSet({
        ...s,
        expire_days: Math.round(parseNum(expire.value)),
        max_items: Math.round(parseNum(max.value)),
        exclusions: excl.value.split(/\r?\n/)
      });
      fill(saved.expire_days, saved.max_items, saved.exclusions);
      msg.textContent = 'Kaydedildi.';
    } catch (e) {
      msg.textContent = errText(e);
    }
  });

  function fill(days: number, maxItems: number, exclusions: string[]): void {
    expire.value = String(days);
    max.value = String(maxItems);
    excl.value = exclusions.join('\n');
  }

  return {
    el,
    refresh: async () => {
      msg.textContent = '';
      const s = await api.settingsGet();
      fill(s.expire_days, s.max_items, s.exclusions);
      try {
        autostart.checked = await api.autostartGet();
      } catch {
        autostart.checked = false;
      }
    }
  };
}
