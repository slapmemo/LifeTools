import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { icon, type IconName } from '../../../design/icons';
import { api, errText, type NativeStatus } from '../api';
import { h, parseNum, type View } from '../dom';

/** Ayar kartı: ikonlu başlık + içerik. */
function section(iconName: IconName, title: string, ...children: (Node | null)[]): HTMLElement {
  return h('div', { class: 'card settings-card' }, h('h3', { class: 'panel-title' }, icon(iconName, 18), title), ...children);
}

/** Metin + açıklama + sağda anahtar (checkbox'ı switch görünümüne sarar). */
function toggleRow(label: string, input: HTMLInputElement, hint?: string): HTMLElement {
  return h('label', { class: 'settings-row' },
    h('span', { class: 'settings-label' }, label, hint ? h('span', { class: 'hint' }, hint) : null),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track' })));
}

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
    void win.setBackgroundColor(isDark ? '#10111a' : '#f6f5fb').catch(() => undefined);
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
  const defaults = ['Ctrl+Alt+V', 'Ctrl+Shift+Space', 'Ctrl+Alt+N'];
  let shortcuts = [...defaults];
  // Boş metin = kısayol kapalı. Yeniden açınca son kullanılan tuş geri gelir.
  const lastOn = [...defaults];
  const rememberOn = (values: string[]) => values.forEach((v, i) => { if (v) lastOn[i] = v; });
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
  const shortcutToggles = defaults.map((_, index) => {
    const toggle = h('input', { type: 'checkbox', title: 'Kısayolu aç / kapat', 'aria-label': 'Kısayolu aç / kapat' });
    toggle.addEventListener('change', () => {
      if (saving) return;
      recording = null;
      const next = [...shortcuts];
      next[index] = toggle.checked ? lastOn[index] : '';
      void saveShortcuts(next);
    });
    return toggle;
  });
  function renderShortcuts(): void {
    shortcutButtons.forEach((button, index) => {
      const on = shortcuts[index] !== '';
      button.textContent = recording === index ? 'Tuşlara bas…' : on ? shortcuts[index] : 'Kapalı';
      button.disabled = saving || !on;
      shortcutToggles[index].checked = on;
      shortcutToggles[index].disabled = saving;
    });
    disableAllShortcuts.disabled = saving || shortcuts.every(s => s === '');
  }
  async function saveShortcuts(next: string[]): Promise<void> {
    saving = true;
    shortcutError.textContent = '';
    renderShortcuts();
    try {
      await api.shortcutsSet(next[0], next[1], next[2]);
      shortcuts = next;
      rememberOn(next);
    } catch (e) {
      shortcutError.textContent = errText(e);
    } finally {
      saving = false;
      renderShortcuts();
    }
  }
  const resetShortcuts = h('button', { type: 'button' }, 'Varsayılana dön');
  resetShortcuts.addEventListener('click', () => { if (!saving) { recording = null; void saveShortcuts([...defaults]); } });
  const disableAllShortcuts = h('button', { type: 'button' }, 'Tümünü kapat');
  disableAllShortcuts.addEventListener('click', () => { if (!saving) { recording = null; void saveShortcuts(['', '', '']); } });
  const shortcutRow = (label: string, index: number) =>
    h('div', { class: 'settings-row' }, h('span', { class: 'settings-label' }, label),
      h('div', { class: 'settings-controls' }, shortcutButtons[index], h('label', { class: 'switch' }, shortcutToggles[index], h('span', { class: 'switch-track' }))));
  const autostart = h('input', { type: 'checkbox' });
  const copyOnly = h('input', { type: 'checkbox' });
  const battNotify = h('input', { type: 'checkbox' });
  const expire = h('input', { type: 'number', min: '1', max: '365' });
  const max = h('input', { type: 'number', min: '10', max: '5000' });
  const excl = h('textarea', { rows: 6, class: 'grow' });
  const msg = h('div', { class: 'muted' });
  const version = h('p', { class: 'page-subtitle' }, 'LifeTools masaüstü');
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
      const outcome = await api.updateInstall();
      if (outcome === 'up_to_date') {
        updateStatus.textContent = 'LifeTools güncel.';
        updateInstallBtn.hidden = true;
      } else if (outcome === 'postponed') {
        updateStatus.textContent = 'Şu an bir video indiriliyor, güncelleme sonra yapılacak.';
      } else {
        updateStatus.textContent = 'Güncelleme yüklendi. Uygulama yeniden başlayacak.';
      }
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
  const extOpen = h('button', { type: 'button' }, icon('external-link', 16), 'Klasörü aç');
  extOpen.addEventListener('click', async () => {
    try { await api.extensionOpenFolder(); } catch (e) { nativeStatus.textContent = `Hata: ${errText(e)}`; }
  });
  const saveBtn = h('button', { type: 'button', class: 'primary' }, 'Kaydet');
  const nativeStatus = h('div', { class: 'muted' });
  const nativeConnect = h('button', { type: 'button', class: 'primary' }, 'Bağla');
  const nativeRemove = h('button', { type: 'button', class: 'danger-button' }, 'Bağlantıyı kaldır');
  const backupBtn = h('button', { type: 'button' }, icon('download', 16), 'Yedeği indir');
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
  const themeGroup = h('div', { class: 'chip-tabs', role: 'radiogroup', 'aria-label': 'Görünüm' });
  const welcomeButton = h('button', { type: 'button', onClick: () => window.dispatchEvent(new Event('lifetools:show-welcome')) }, 'Karşılama ekranını göster');

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
    h('header', { class: 'page-header' },
      h('h2', { class: 'page-title page-title-icon' }, icon('settings', 26), 'Ayarlar'),
      version),
    msg,
    section('app-window', 'Görünüm',
      h('div', { class: 'settings-row' }, h('span', { class: 'settings-label' }, 'Tema'), themeGroup),
      h('div', { class: 'toolbar settings-actions' }, welcomeButton)),
    section('zap', 'Başlangıç ve bildirimler',
      toggleRow('Windows açılışında başlat', autostart),
      toggleRow('Pil %20 altına düşünce bildir', battNotify)),
    section('keyboard', 'Kısayollar',
      shortcutRow('Pano seçici', 0),
      shortcutRow('Şablon seçici', 1),
      shortcutRow('Hızlı not', 2),
      toggleRow('Şablonu yalnızca panoya kopyala', copyOnly, 'Otomatik yapıştırma yapılmaz.'),
      h('div', { class: 'toolbar settings-actions' }, resetShortcuts, disableAllShortcuts), shortcutError),
    section('clipboard', 'Pano gizliliği',
      h('label', { class: 'settings-row' }, h('span', { class: 'settings-label' }, 'Sabitlenmemiş kayıtlar şu kadar gün sonra silinir'), expire),
      h('label', { class: 'settings-row' }, h('span', { class: 'settings-label' }, 'En fazla kayıt sayısı', h('span', { class: 'hint' }, 'Sabitlenenler sayılmaz.')), max),
      h('label', { class: 'field' }, h('span', { class: 'settings-label' }, 'Kaydedilmeyecek uygulamalar', h('span', { class: 'hint' }, 'Her satıra bir exe adı.')), excl),
      h('div', { class: 'toolbar settings-actions' }, saveBtn)),
    section('link', 'Chrome bağlantısı',
      h('p', { class: 'hint' }, 'Eklentinin verileri bu uygulamanın veritabanında (%APPDATA%\\LifeTools\\lifetools.db) saklanabilir. Önce burada bağla, sonra eklentide "Verileri masaüstüne taşı" düğmesine bas. Bağlantıdan sonra Chrome\'u yeniden başlatmak gerekmez.'),
      h('div', { class: 'toolbar settings-actions' }, nativeConnect, nativeRemove), nativeStatus,
      h('div', { class: 'settings-subbox' },
        extPath,
        h('p', { class: 'hint' }, 'Chrome\'da chrome://extensions → Geliştirici modu → Paketlenmemiş öğe yükle → bu klasörü seç. Sonraki sürümler otomatik gelir.'),
        h('div', { class: 'toolbar settings-actions' }, extOpen))),
    section('refresh-cw', 'Güncellemeler',
      updateVersion,
      toggleRow('Otomatik güncelle', autoUpdate),
      h('div', { class: 'toolbar settings-actions' }, updateCheckBtn, updateInstallBtn), updateStatus),
    section('archive', 'Yedek',
      h('p', { class: 'hint' }, 'Notlar, şablonlar, izleme listesi ve diğer veriler İndirilenler\\LifeTools\\Yedekler klasörüne JSON olarak kaydedilir.'),
      h('div', { class: 'toolbar settings-actions' }, backupBtn), backupStatus),
    section('download', 'İndirme araçları', videoStatus, videoFolder, h('div', { class: 'toolbar settings-actions' }, videoInstall, videoUpdate, videoOpen))
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
      shortcuts = [p.picker_shortcut, p.snippets_shortcut, p.quicknote_shortcut];
      rememberOn(shortcuts);
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
