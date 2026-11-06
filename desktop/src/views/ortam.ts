import { api, errText } from '../api';
import { ambient, CHANNEL_IDS, CHANNEL_LABELS, parseConfig, type AmbientConfig } from '../ambient';
import { debounce, h, type View } from '../dom';

const TIMERS: [string, number | null][] = [
  ['Zamanlayıcı yok', null],
  ['15 dk', 15],
  ['30 dk', 30],
  ['60 dk', 60],
  ['90 dk', 90],
  ['120 dk', 120]
];

const saveLast = debounce(() => void api.ambientLastSet(JSON.stringify(ambient.config)).catch(() => undefined), 500);

ambient.onBlocked = () => void api.toast('Ses başlatılamadı: LifeTools penceresinde bir kez tıkla.').catch(() => undefined);

/** Tepsi menüsü: son kullanılan ayarla oynat / durdur. */
export async function toggleFromTray(): Promise<void> {
  if (ambient.playing) {
    ambient.stop();
    return;
  }
  try {
    ambient.config = parseConfig(await api.ambientLastGet());
  } catch {
    /* varsayılanlarla devam */
  }
  if (!Object.values(ambient.config.channels).some((c) => c.on)) {
    void api.toast('Ortam sesi: önce Ortam sesi bölümünden bir kanal aç.').catch(() => undefined);
    return;
  }
  await ambient.play();
}

export function ambientView(): View {
  const playBtn = h('button', {}, 'Çal');
  const master = h('input', { type: 'range', min: '0', max: '100', class: 'grow' });
  const timer = h('select', {}, ...TIMERS.map(([label, v]) => h('option', { value: v === null ? '' : String(v) }, label)));
  const remain = h('span', { class: 'muted' });
  const msg = h('div', { class: 'muted status' });
  const presetSel = h('select', { class: 'grow' });
  const nameInput = h('input', { type: 'text', placeholder: 'Ön ayar adı', maxLength: 40 });
  const delBtn = h('button', { class: 'danger' }, 'Sil');
  const chRows = new Map<(typeof CHANNEL_IDS)[number], { on: HTMLInputElement; vol: HTMLInputElement }>();
  let presets: { id: number; name: string; config_json: string }[] = [];
  let armed: number | undefined;

  const channelsBox = h('div', { class: 'list' });
  for (const id of CHANNEL_IDS) {
    const on = h('input', { type: 'checkbox' });
    const vol = h('input', { type: 'range', min: '0', max: '100', class: 'grow' });
    chRows.set(id, { on, vol });
    const changed = () => {
      ambient.config.channels[id] = { on: on.checked, vol: Number(vol.value) / 100 };
      ambient.apply();
      saveLast();
    };
    on.addEventListener('change', changed);
    vol.addEventListener('input', changed);
    channelsBox.append(h('div', { class: 'row ch-row' }, h('label', { class: 'check ch-name' }, on, ' ' + CHANNEL_LABELS[id]), vol));
  }

  const el = h(
    'section',
    {},
    h('h2', {}, 'Ortam sesi'),
    h('p', { class: 'muted' }, 'Tüm sesler cihazında sentezlenir; dosya veya ağ kullanılmaz. Pencere tepsiye gizlense de çalmaya devam eder.'),
    h('div', { class: 'toolbar' }, playBtn, h('label', {}, 'Ana ses '), master),
    h('div', { class: 'toolbar' }, h('label', {}, 'Kapat: ', timer), remain),
    channelsBox,
    h('h3', {}, 'Ön ayarlar'),
    h('div', { class: 'toolbar' }, presetSel, h('button', { onClick: () => loadPreset() }, 'Yükle'), delBtn),
    h('div', { class: 'toolbar' }, nameInput, h('button', { onClick: () => void savePreset() }, 'Kaydet')),
    msg
  );

  function flash(t: string): void {
    msg.textContent = t;
    window.setTimeout(() => (msg.textContent = ''), 2500);
  }

  function syncUi(): void {
    const c = ambient.config;
    master.value = String(Math.round(c.master * 100));
    for (const [id, r] of chRows) {
      r.on.checked = c.channels[id].on;
      r.vol.value = String(Math.round(c.channels[id].vol * 100));
    }
    timer.value = ambient.timerMin === null ? '' : String(ambient.timerMin);
    playBtn.textContent = ambient.playing ? 'Durdur' : 'Çal';
    const r = ambient.remaining();
    remain.textContent = r === null ? '' : `Kalan: ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
  }

  function applyConfig(cfg: AmbientConfig): void {
    ambient.config = cfg;
    ambient.apply();
    syncUi();
    saveLast();
  }

  async function loadPresets(): Promise<void> {
    presets = await api.presetList();
    presetSel.replaceChildren(...presets.map((p) => h('option', { value: String(p.id) }, p.name)));
    if (presets.length === 0) presetSel.append(h('option', { value: '' }, '(kayıtlı ön ayar yok)'));
  }

  function selected() {
    return presets.find((p) => String(p.id) === presetSel.value);
  }

  function loadPreset(): void {
    const p = selected();
    if (!p) return;
    applyConfig(parseConfig(p.config_json));
    nameInput.value = p.name;
    flash(`"${p.name}" yüklendi.`);
  }

  async function savePreset(): Promise<void> {
    try {
      const name = nameInput.value.trim() || selected()?.name || '';
      await api.presetSave(name, JSON.stringify(ambient.config));
      await loadPresets();
      const p = presets.find((x) => x.name === name);
      if (p) presetSel.value = String(p.id);
      flash('Ön ayar kaydedildi.');
    } catch (e) {
      flash(errText(e));
    }
  }

  playBtn.addEventListener('click', () => {
    if (ambient.playing) ambient.stop();
    else if (!Object.values(ambient.config.channels).some((c) => c.on)) flash('Önce en az bir kanalı aç.');
    else void ambient.play();
  });
  master.addEventListener('input', () => {
    ambient.config.master = Number(master.value) / 100;
    ambient.apply();
    saveLast();
  });
  timer.addEventListener('change', () => ambient.setTimer(timer.value === '' ? null : Number(timer.value)));
  delBtn.addEventListener('click', async () => {
    const p = selected();
    if (!p) return;
    if (armed === undefined) {
      delBtn.textContent = 'Emin misin?';
      armed = window.setTimeout(() => {
        armed = undefined;
        delBtn.textContent = 'Sil';
      }, 3000);
      return;
    }
    window.clearTimeout(armed);
    armed = undefined;
    delBtn.textContent = 'Sil';
    await api.presetDelete(p.id);
    await loadPresets();
  });

  ambient.onChange = syncUi;
  window.setInterval(() => {
    if (ambient.playing && document.body.contains(el)) syncUi();
  }, 1000);

  return {
    el,
    refresh: async () => {
      if (!ambient.playing) {
        try {
          ambient.config = parseConfig(await api.ambientLastGet());
        } catch {
          /* mevcut ayarla devam */
        }
      }
      syncUi();
      await loadPresets();
    }
  };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = ambientView();
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
