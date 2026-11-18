export type PageThemeMode = 'system' | 'light' | 'dark';

const LIGHT_VARS = `color-scheme: light;
    --lt-bg: #f8f9fc; --lt-surface: #ffffff; --lt-sub: #f3f5f9; --lt-border: #e4e8ef;
    --lt-text: #222a39; --lt-muted: #626c7d; --lt-accent: #6258da; --lt-accent-soft: #eeedff;
    --lt-on-accent: #ffffff; --lt-shadow: 0 12px 30px #2734481a;`;
const DARK_VARS = `color-scheme: dark;
      --lt-bg: #181b24; --lt-surface: #222632; --lt-sub: #292e3b; --lt-border: #353b49;
      --lt-text: #f0f2f8; --lt-muted: #a0a9ba; --lt-accent: #a69cff; --lt-accent-soft: #383351;
      --lt-on-accent: #181b24; --lt-shadow: 0 12px 30px #00000040;`;
const BASE = 'all: initial; font: 13px/1.4 "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;';
const FOCUS = 'button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--lt-accent); outline-offset: 2px; }';

/** Sayfaya eklenen kutuların (gölge DOM) renkleri. "system" işletim sisteminin temasını, diğerleri eklentideki seçimi izler. */
export function pageTheme(mode: PageThemeMode): string {
  if (mode === 'dark') return `\n  :host { ${BASE} ${DARK_VARS} }\n  ${FOCUS}\n`;
  if (mode === 'light') return `\n  :host { ${BASE} ${LIGHT_VARS} }\n  ${FOCUS}\n`;
  return `\n  :host { ${BASE} ${LIGHT_VARS} }\n  @media (prefers-color-scheme: dark) {\n    :host { ${DARK_VARS} }\n  }\n  ${FOCUS}\n`;
}

export const PAGE_THEME = pageTheme('system');

export function toPageThemeMode(value: unknown): PageThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Service worker için: kayıtlı `ui_theme` ayarına göre CSS (executeScript argümanı olarak gönderilir). */
export async function storedPageTheme(): Promise<string> {
  try {
    return pageTheme(toPageThemeMode((await chrome.storage.local.get({ ui_theme: 'system' })).ui_theme));
  } catch {
    return PAGE_THEME;
  }
}

let liveMode: PageThemeMode = 'system';
let tracking = false;

/**
 * İçerik betikleri için: eklentideki tema seçimine göre CSS. İlk çağrıda ayarı okumaya ve değişimini
 * dinlemeye başlar; ayar gelene kadar sistem teması kullanılır. Yeni oluşturulan kutular güncel temayı alır.
 */
export function livePageTheme(): string {
  if (!tracking && typeof chrome !== 'undefined' && chrome.storage?.local) {
    tracking = true;
    void chrome.storage.local.get({ ui_theme: 'system' }).then(data => { liveMode = toPageThemeMode(data.ui_theme); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.ui_theme) liveMode = toPageThemeMode(changes.ui_theme.newValue); });
  }
  return pageTheme(liveMode);
}
