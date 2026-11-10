import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
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
  const defaults = ['Ctrl+Alt+V', 'Ctrl+Shift+Space', 'Ctrl+Alt+T'];
  let shortcuts = [...defaults];
  let recording: number | null = null;
  let saving = false;
  const shortcutError = h('p', { class: 'muted', role: 'alert' });
  const shortcutButtons = defaults.map((value, index) => {
    const button = h('button', { type: 'button', class: 'chip chip-mono' }, value);
    button.addEventListener('click', () => {
      if (saving) return;
      recording = index;
      renderShortcuts();
      button.focus();
    });
    button.addEventListener('blur', () => { if (recording === index) { recording = null; renderShortcuts(); } });
    button.addEventListener('keydown', (event: KeyboardEvent) => {
      if (recording !== index) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { recording = null; renderShortcuts(); return; }
      if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(event.key)) return;
      const key = event.code.startsWith('Key') ? event.code.slice(3) :
        event.code.startsWith('Digit') ? event.code.slice(5) : event.code;
      const parts = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Super', key].filter(Boolean);
      const next = [...shortcuts];
      next[index] = parts.join('+');
      recording = null;
      void saveShortcuts(next);
    });
    return button;
  });
  function renderShortcuts(): void {
    shortcutButtons.forEach((button, index) => { button.textContent = recording === index ? 'Tuşlara bas…' : shortcuts[index]; button.disabled = saving; });
  }
  async function saveShortcuts(next: string[]): Promise<void> {
    saving = true;
    shortcutError.textContent = '';
    renderShortcuts();
    try {
      await api.shortcutsSet(next[0], next[1], next[2]);
      shortcuts = next;
    } catch (e) {
      shortcutError.textContent = errText(e);
    } finally {
      saving = false;
      renderShortcuts();
    }
  }
  const resetShortcuts = h('button', { type: 'button' }, 'Varsayılana dön');
  resetShortcuts.addEventListener('click', () => { if (!saving) { recording = null; void saveShortcuts([...defaults]); } });
  const autostart = h('input', { type: 'checkbox' });
  const copyOnly = h('input', { type: 'checkbox' });
  const battNotify = h('input', { type: 'checkbox' });
  const expire = h('input', { type: 'number', min: '1', max: '365' });
  const max = h('input', { type: 'number', min: '10', max: '5000' });
  const excl = h('textarea', { rows: 6, class: 'grow' });
  const msg = h('div', { class: 'muted' });
  const version = h('p', { class: 'muted' });
  void getVersion().then(value => { version.textContent = `LifeTools masaüstü · Sürüm ${value}`; }).catch(() => undefined);
  const autoUpdate = h('input', { type: 'checkbox' });
  const updateCheckBtn = h('button', { type: 'button' }, 'Güncellemeleri denetle');
  const updateInstallBtn = h('button', { type: 'button', class: 'primary' }, 'Şimdi güncelle');
  updateInstallBtn.hidden = true;
  const updateStatus = h('p', { class: 'muted', role: 'status' });
  const updateVersion = h('p', { class: 'muted' }, 'Sürüm …');
  void getVersion().then(value => { updateVersion.textContent = `Güncel sürüm: ${value}`; }).catch(() => undefined);
  updateCheckBtn.addEventListener('click', async () => {
    updateCheckBtn.disabled = true;
    updateInstallBtn.hidden = true;
    updateStatus.textContent = 'Denetleniyor…';
    try {
      const r = await api.updateCheck();
      if (r.available) {
        updateStatus.textContent = `Yeni sürüm var: ${r.version ?? ''}${r.notes ? ` — ${r.notes}` : ''}`;
        updateInstallBtn.hidden = false;
      } else {
        updateStatus.textContent = 'LifeTools güncel.';
      }
    } catch (e) {
      updateStatus.textContent = `Güncelleme denetlenemedi: ${errText(e)}`;
    } finally {
      updateCheckBtn.disabled = false;
    }
  });
  updateInstallBtn.addEventListener('click', async () => {
    updateInstallBtn.disabled = true;
    updateCheckBtn.disabled = true;
    updateStatus.textContent = 'İndiriliyor… Uygulama yeniden başlayacak.';
    try {
      await api.updateInstall();
    } catch (e) {
      updateStatus.textContent = `Güncelleme başarısız: ${errText(e)}`;
    } finally {
      updateInstallBtn.disabled = false;
      updateCheckBtn.disabled = false;
    }
  });
  autoUpdate.addEventListener('change', async () => {
    try {
      autoUpdate.checked = await api.autoUpdateSet(autoUpdate.checked);
    } catch (e) {
      msg.textContent = errText(e);
    }
  });
  const extPath = h('p', { class: 'muted', style: 'user-select: text; overflow-wrap: anywhere' }, 'Eklenti klasörü: …');
  const extOpen = h('button', { type: 'button' }, 'Klasörü aç');
  extOpen.addEventListener('click', async () => {
    try { await api.extensionOpenFolder(); } catch (e) { nativeStatus.textContent = `Hata: ${errText(e)}`; }
  });
  const saveBtn = h('button', {}, 'Kaydet');
  const nativeStatus = h('div', { class: 'muted' });
  const nativeConnect = h('button', {}, 'Bağla');
  const nativeRemove = h('button', { class: 'danger' }, 'Bağlantıyı kaldır');
  const backupBtn = h('button', { type: 'button' }, 'Yedeği indir');
  const backupStatus = h('p', { class: 'muted', role: 'status', style: 'user-select: text; overflow-wrap: anywhere' });
  const videoStatus = h('p', { class: 'muted', role: 'status' });
  const videoFolder = h('p', { class: 'muted', style: 'user-select: text; overflow-wrap: anywhere' });
  const videoInstall = h('button', { type: 'button' }, 'Kur');
  const videoUpdate = h('button', { type: 'button' }, 'Güncelle');
  const videoOpen = h('button', { type: 'button' }, 'Klasörü aç');
  const refreshVideo = async () => { try { const s = await api.videoToolsStatus(); videoStatus.textContent = s.installing ? 'Araçlar kuruluyor…' : `yt-dlp: ${s.ytdlp.installed ? s.ytdlp.version ?? 'kurulu' : 'kurulu değil'} · ffmpeg: ${s.ffmpeg ? 'kurulu' : 'kurulu değil'}`; if (s.error && !s.installing) videoStatus.textContent += ` · ${s.error}`; videoFolder.textContent = s.folder; videoInstall.disabled = s.installing; if (s.installing) setTimeout(() => void refreshVideo(), 3000); } catch (e) { videoStatus.textContent = `Hata: ${errText(e)}`; } };
  videoInstall.addEventListener('click', async () => { try { await api.videoToolsInstall(); await refreshVideo(); } catch (e) { videoStatus.textContent = `Hata: ${errText(e)}`; } });
  videoUpdate.addEventListener('click', async () => { videoUpdate.disabled = true; try { await api.videoToolsUpdate(); await refreshVideo(); } catch (e) { videoStatus.textContent = `Hata: ${errText(e)}`; } finally { videoUpdate.disabled = false; } });
  videoOpen.addEventListener('click', async () => { try { await api.videoOpenFolder(); } catch (e) { videoStatus.textContent = `Hata: ${errText(e)}`; } });

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
    h('div', { class: 'card settings-card' }, h('h3', {}, 'İndirme araçları'), videoStatus, videoFolder, h('div', { class: 'toolbar' }, videoInstall, videoUpdate, videoOpen)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Başlangıç'),
      h('label', { class: 'settings-row' }, 'Windows açılışında başlat', autostart),
      h('label', { class: 'settings-row' }, 'Pil %20 altına düşünce bildir', battNotify)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Kısayollar'),
      h('div', { class: 'settings-row' }, 'Pano seçici', shortcutButtons[0]),
      h('div', { class: 'settings-row' }, 'Etkin pencereyi üstte tut / bırak', shortcutButtons[2]),
      h('div', { class: 'settings-row' }, 'Şablon seçici', shortcutButtons[1]),
      h('label', { class: 'settings-row' }, 'Şablonu yalnızca panoya kopyala (otomatik yapıştırma yok)', copyOnly)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Chrome bağlantısı'),
      h('p', { class: 'muted' }, 'Eklentinin verileri bu uygulamanın veritabanında (%APPDATA%\\LifeTools\\lifetools.db) saklanabilir. Önce burada bağla, sonra eklentide "Verileri masaüstüne taşı" düğmesine bas. Bağlantıdan sonra Chrome\'u yeniden başlatmak gerekmez.'),
      h('div', { class: 'toolbar' }, nativeConnect, nativeRemove), nativeStatus,
      extPath, h('div', { class: 'toolbar' }, extOpen),
      h('p', { class: 'muted' }, 'Chrome\'da chrome://extensions → Geliştirici modu → Paketlenmemiş öğe yükle → bu klasörü seç. Sonraki sürümler otomatik gelir.')),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Güncellemeler'),
      updateVersion,
      h('label', { class: 'settings-row' }, 'Otomatik güncelle', autoUpdate),
      h('div', { class: 'toolbar' }, updateCheckBtn, updateInstallBtn), updateStatus),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Görünüm'),
      h('div', { class: 'settings-row' }, 'Tema', themeGroup)),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Yedek'), backupBtn, backupStatus),
    h('div', { class: 'card settings-card' }, h('h3', {}, 'Pano gizliliği'),
      h('label', { class: 'settings-row' }, 'Sabitlenmemiş kayıtlar şu kadar gün sonra silinir', expire),
      h('label', { class: 'settings-row' }, 'En fazla kayıt sayısı (sabitlenenler hariç)', max),
      h('label', { class: 'field' }, 'Kaydedilmeyecek uygulamalar (her satıra bir exe adı)', excl),
      h('div', { class: 'toolbar settings-save' }, saveBtn)),
    msg, version
  );

  const savePrefs = async () => {
    try {
      await api.prefsSet({ ...await api.prefsGet(), copy_only: copyOnly.checked, battery_notify: battNotify.checked });
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
      void refreshVideo();
      syncThemeUi(await loadTheme());
      const s = await api.settingsGet();
      fill(s.expire_days, s.max_items, s.exclusions);
      const p = await api.prefsGet();
      shortcuts = [p.picker_shortcut, p.snippets_shortcut, p.topmost_shortcut];
      renderShortcuts();
      copyOnly.checked = p.copy_only;
      battNotify.checked = p.battery_notify;
      try {
        autostart.checked = await api.autostartGet();
      } catch {
        autostart.checked = false;
      }
      try {
        autoUpdate.checked = await api.autoUpdateGet();
      } catch {
        autoUpdate.checked = true;
      }
      try {
        const ext = await api.extensionInfo();
        extPath.textContent = `Eklenti klasörü: ${ext.dir ?? 'bulunamadı'}${ext.version ? ` (v${ext.version})` : ''}`;
        extOpen.disabled = !ext.dir;
      } catch {
        extPath.textContent = 'Eklenti klasörü: bulunamadı';
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
