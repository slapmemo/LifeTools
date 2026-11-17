/**
 * Masaüstü uygulamasının aç/kapat yapılabilen özellikleri (masaüstü Özellik rehberi).
 * Saf veri: masaüstü arayüzü ve eklenti testleri birlikte kullanır.
 * Kimlikler Rust tarafındaki desktop/src-tauri/src/features.rs ile aynı olmalı; ayar `settings` tablosunda
 * `desktop_features` anahtarıyla JSON olarak durur ve yalnızca açıkça `false` yazılan özellik kapalıdır.
 */
export const DESKTOP_FEATURES_KEY = 'desktop_features';

export type DesktopFeatureId = 'notlar' | 'izleme' | 'sablonlar' | 'pano' | 'ortam' | 'piller';
export type DesktopShortcut = 'picker_shortcut' | 'snippets_shortcut' | 'quicknote_shortcut';

export interface DesktopFeature {
  id: DesktopFeatureId;
  name: string;
  description: string;
  example: string;
  /** Kapatınca ne olur (kullanıcıya gösterilir). */
  whenOff: string;
  /** Kısayolun Prefs alanı; tuş canlı okunur. */
  shortcut?: DesktopShortcut;
  shortcutLabel?: string;
}

export const DESKTOP_FEATURES: readonly DesktopFeature[] = [
  { id: 'notlar', name: 'Notlar', description: 'Notlarını, okunacakları ve fikirlerini tek yerde tut.', example: 'Herhangi bir programdayken hızlı not kısayoluna bas, aklındakini yaz, Enter.', whenOff: 'Menüden kalkar, hızlı not kısayolu çalışmaz.', shortcut: 'quicknote_shortcut', shortcutLabel: 'Hızlı not' },
  { id: 'izleme', name: 'İzleme listesi', description: 'Film, dizi ve videoları İzlenecek / İzleniyor / Bitti diye takip et.', example: 'Eklentideki "+ İzle" ile eklediklerin burada da görünür.', whenOff: 'Menüden kalkar.' },
  { id: 'sablonlar', name: 'Metin şablonları', description: 'Sık yazdığın metinleri kaydet, her programda yapıştır.', example: 'Bir e-posta kutusundayken şablon kısayoluna bas, şablonu seç; metin yazılır.', whenOff: 'Menüden kalkar, şablon seçici kısayolu çalışmaz.', shortcut: 'snippets_shortcut', shortcutLabel: 'Şablon seçici' },
  { id: 'pano', name: 'Pano geçmişi', description: 'Kopyaladığın metinler saklanır; eskisini bulup yeniden kopyala.', example: 'Pano kısayoluna bas, birkaç dakika önce kopyaladığın bağlantıyı seç.', whenOff: 'Kopyaladıkların kaydedilmez, pano kısayolu çalışmaz.', shortcut: 'picker_shortcut', shortcutLabel: 'Pano seçici' },
  { id: 'ortam', name: 'Ortam sesi', description: 'Yağmur, fan, kahverengi gürültü gibi sesleri karıştırıp odaklanırken çal.', example: 'Yağmur ve fanı aç, sesi ayarla, ön ayar olarak kaydet; tepsiden oynat/durdur.', whenOff: 'Menüden ve ana sayfadan kalkar, çalıyorsa durur.' },
  { id: 'piller', name: 'Piller', description: 'Dizüstü, Bluetooth ve desteklenen USB alıcılı fare, kulaklık, kumandaların pil düzeyi.', example: 'Kablosuz faren %20\'nin altına inince bildirim gelir; tepsi simgesinde de görünür.', whenOff: 'Aygıtlar hiç taranmaz, pil bildirimi gelmez.' }
];

export function parseDesktopFlags(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  } catch { return {}; }
}

export function desktopFeatureEnabled(flags: Record<string, boolean>, id: string): boolean {
  return flags[id] !== false;
}
