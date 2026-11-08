import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api, errText, type NativeStatus } from '../api';
import { h, parseNum, type View } from '../dom';

export type ThemeMode = 'system' | 'light' | 'dark';

export const THEME_SETTING_KEY = 'theme';
const STORAGE_KEY = 'lifetools_theme';

const THEME_OPTIONS: [ThemeMode, string][] = [
  ['system', 'Sistem'],
  ['light', 'Açık'],
  ['dark', 'Koyu']
];

export function normalizeTheme(raw: unknown): ThemeMode {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** data-theme özniteliğini <html> üzerinde günceller (system → özniteliği kaldırır). */
export function applyTheme(mode: ThemeMode): void {
  if (mode === 'light' || mode === 'dark') {
    document.documentElement.setAttribute('data-theme', mode);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* localStorage kullanılamıyor */
  }
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  try {
    const win = getCurrentWindow();
    void win.setBackgroundColor(isDark ? '#171d19' : '#f6f8f5').catch(() => undefined);
    void win.setTheme(mode === 'system' ? null : mode).catch(() => undefined);
  } catch {
    /* Tauri penceresi dışında */
  }
}

export function applyCachedTheme(): ThemeMode {
  let cached: string | null = null;
  try {
    cached = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* localStorage kullanılamıyor */
  }
  const mode = normalizeTheme(cached);
  applyTheme(mode);
  return mode;
}

/** Rust get_setting komutu üzerinden kayıtlı temayı yükler. */
export async function loadTheme(): Promise<ThemeMode> {
  try {
    const raw = await api.getSetting(THEME_SETTING_KEY);
    const mode = normalizeTheme(raw);
    applyTheme(mode);
    return mode;
  } catch {
    return applyCachedTheme();
  }
}

/** Rust set_setting komutu üzerinden temayı kaydeder ve uygular. */
export async function saveTheme(mode: ThemeMode): Promise<void> {
  const normalized = normalizeTheme(mode);
  applyTheme(normalized);
  await api.setSetting(THEME_SETTING_KEY, normalized);
  void emit('theme-changed', normalized).catch(() => undefined);
}

export function bindThemeListener(): void {
  void listen<string>('theme-changed', (e) => {
    applyTheme(normalizeTheme(e.payload));
  }).catch(() => undefined);
}

export function settingsView(): View {
  const autostart = h('input', { type: 'checkbox' });
  const copyOnly = h('input', { type: 'checkbox' });
  const battNotify = h('input', { type: 'checkbox' });
  const expire = h('input', { type: 'number', min: '1', max: '365' });
  const max = h('input', { type: 'number', min: '10', max: '5000' });
  const excl = h('textarea', { rows: 6, class: 'grow' });
  const msg = h('div', { class: 'muted' });
  const saveBtn = h('button', {}, 'Kaydet');
  const nativeStatus = h('div', { class: 'muted' });
  const nativeConnect = h('button', {}, 'Bağla');
  const nativeRemove = h('button', { class: 'danger' }, 'Bağlantıyı kaldır');
  const backupBtn = h('button', { type: 'button' }, 'Yedeği indir');
  const backupStatus = h('p', { class: 'muted', role: 'status', style: 'user-select: text; overflow-wrap: anywhere' });

  const themeBtns = new Map<ThemeMode, HTMLButtonElement>();
  const themeGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Görünüm' });

  function syncThemeUi(active: ThemeMode): void {
    for (const [mode, btn] of themeBtns) {
      const isSelected = mode === active;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-pressed', String(isSelected));
    }
  }

  for (const [mode, label] of THEME_OPTIONS) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: 'seg-btn',
        'data-theme-value': mode,
        'aria-pressed': 'false',
        onClick: async () => {
          syncThemeUi(mode);
          try {
            await saveTheme(mode);
          } catch (e) {
            msg.textContent = errText(e);
          }
        }
      },
      label
    );
    themeBtns.set(mode, btn);
    themeGroup.append(btn);
  }
  syncThemeUi('system');

  const el = h(
    'section',
    { class: 'settings-view' },
    h('h2', {}, 'Ayarlar'),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Başlangıç'),
      h('label', { class: 'settings-row' }, 'Windows açılışında başlat', autostart),
      h('label', { class: 'settings-row' }, 'Pil %20 altına düşünce bildir', battNotify)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Kısayollar'),
      h('div', { class: 'settings-row' }, 'Pano seçici', h('span', { class: 'chip chip-mono' }, 'Ctrl+Shift+V')),
      h('div', { class: 'settings-row' }, 'Etkin pencereyi üstte tut / bırak', h('span', { class: 'chip chip-mono' }, 'Ctrl+Alt+T')),
      h('div', { class: 'settings-row' }, 'Şablon seçici', h('span', { class: 'chip chip-mono' }, 'Ctrl+Shift+Space')),
      h('label', { class: 'settings-row' }, 'Şablonu yalnızca panoya kopyala (otomatik yapıştırma yok)', copyOnly)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Chrome bağlantısı'),
      h('p', { class: 'muted' }, 'Eklentinin verileri bu uygulamanın veritabanında (%APPDATA%\\LifeTools\\lifetools.db) saklanabilir. Önce burada bağla, sonra eklentide "Verileri masaüstüne taşı" düğmesine bas. Bağlantıdan sonra Chrome\'u yeniden başlatmak gerekmez.'),
      h('div', { class: 'toolbar' }, nativeConnect, nativeRemove), nativeStatus),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Görünüm'),
      h('div', { class: 'settings-row' }, 'Tema', themeGroup)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Yedek'), backupBtn, backupStatus),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Pano gizliliği'),
      h('label', { class: 'settings-row' }, 'Sabitlenmemiş kayıtlar şu kadar gün sonra silinir', expire),
      h('label', { class: 'settings-row' }, 'En fazla kayıt sayısı (sabitlenenler hariç)', max),
      h('label', { class: 'field' }, 'Kaydedilmeyecek uygulamalar (her satıra bir exe adı)', excl),
      h('div', { class: 'toolbar settings-save' }, saveBtn)),
    msg
  );

  const savePrefs = async () => {
    try {
      await api.prefsSet({ copy_only: copyOnly.checked, battery_notify: battNotify.checked });
    } catch (e) {
      msg.textContent = errText(e);
    }
  };
  backupBtn.addEventListener('click', async () => {
    backupBtn.disabled = true;
    backupStatus.textContent = '';
    try {
      backupStatus.textContent = `Yedek kaydedildi: ${await invoke<string>('backup_export')}`;
    } catch (e) {
      backupStatus.textContent = `Yedek alınamadı: ${errText(e)}`;
    } finally {
      backupBtn.disabled = false;
    }
  });
  copyOnly.addEventListener('change', () => void savePrefs());
  battNotify.addEventListener('change', () => void savePrefs());

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

  function showNative(s: NativeStatus): void {
    nativeStatus.textContent = !s.registered
      ? 'Durum: bağlı değil.'
      : s.path_matches
        ? 'Durum: bağlı (kayıt bu uygulamayı gösteriyor).'
        : `Durum: kayıtlı, ancak başka bir exe'yi gösteriyor (${s.registered_exe ?? '?'}). Yeniden bağla.`;
    nativeConnect.textContent = s.registered ? 'Yeniden bağla' : 'Bağla';
    nativeRemove.disabled = !s.registered;
  }

  nativeConnect.addEventListener('click', async () => {
    try {
      showNative(await api.nativeRegister());
    } catch (e) {
      nativeStatus.textContent = `Hata: ${errText(e)}`;
    }
  });
  nativeRemove.addEventListener('click', async () => {
    try {
      showNative(await api.nativeUnregister());
    } catch (e) {
      nativeStatus.textContent = `Hata: ${errText(e)}`;
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
      syncThemeUi(await loadTheme());
      const s = await api.settingsGet();
      fill(s.expire_days, s.max_items, s.exclusions);
      const p = await api.prefsGet();
      copyOnly.checked = p.copy_only;
      battNotify.checked = p.battery_notify;
      try {
        autostart.checked = await api.autostartGet();
      } catch {
        autostart.checked = false;
      }
      try {
        showNative(await api.nativeStatus());
      } catch (e) {
        nativeStatus.textContent = `Hata: ${errText(e)}`;
      }
    }
  };
}

let instance: View | null = null;

function ensureView(): View {
  if (!instance) instance = settingsView();
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
