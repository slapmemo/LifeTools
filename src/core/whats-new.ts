import { compareVersions, isNewerVersion } from './version';

export type ChangeKind = 'new' | 'improved' | 'fixed' | 'removed';
export interface ChangeItem { kind: ChangeKind; text: string; /** Rehberde rozet alacak modül kimlikleri. */ features?: readonly string[] }
export interface ChangeEntry { version: string; items: readonly ChangeItem[] }

/**
 * Kullanıcıya dönük değişiklik günlüğü (en yeni en üstte). Güncellemeden sonra açılan rehber bunu gösterir.
 * Yeni sürüm yayınlarken buraya da bir giriş ekle (release-notes/vX.Y.Z.md ile aynı içerik, kısa hâli).
 */
export const CHANGELOG: readonly ChangeEntry[] = [
  {
    version: '0.7.0',
    items: [
      { kind: 'new', text: 'Bu özellik rehberi: güncellemelerden sonra neyin değiştiğini burada görürsün. Ayarlar\'dan ve açılır pencereden her zaman açabilirsin.' },
      { kind: 'improved', features: ['tab-manager', 'life-browser'], text: 'Kayıtlı gruplar tek yerde: Sekme Yöneticisi. Her yerde "oturum" yerine "kayıtlı grup" deniyor.' },
      { kind: 'improved', features: ['pip'], text: 'Resim içinde resim düğmesi artık küçük videolarda ve YouTube gibi üstünde kontrol katmanı olan sitelerde de çıkıyor.' },
      { kind: 'removed', text: 'Komut Merkezi sayfası, Sabit Sekme Koruyucu ve Sekme Değiştirici (Alt+Q) kaldırıldı. Arama açılır pencerede duruyor; sekmeler arasında aramak için Chrome\'un Ctrl+Shift+A kısayolunu kullanabilirsin.' },
      { kind: 'fixed', text: '"Etiket ve notlar" bölümü Sekmeler\'in diğer sekmelerinin altında da görünüyordu.' }
    ]
  },
  {
    version: '0.6.0',
    items: [{ kind: 'improved', text: 'Masaüstü tepsi ikonu artık yapraklı LifeTools logosu ve Windows görev çubuğunun temasına uyuyor.' }]
  },
  {
    version: '0.5.10',
    items: [
      { kind: 'improved', text: 'Masaüstü uygulaması ve eklenti baştan sona yeni tasarımda.' },
      { kind: 'new', features: ['time-tracker'], text: 'Süre takibinde siteler logolarıyla görünüyor; açılır pencerede bugünün ilk 3 sitesi.' }
    ]
  }
];

/** `from`dan (hariç) `to`ya (dahil) kadar olan girişler, en yeni en üstte. */
export function changesSince(from: string, to: string, log: readonly ChangeEntry[] = CHANGELOG): ChangeEntry[] {
  return log.filter(e => isNewerVersion(e.version, from) && (compareVersions(e.version, to) ?? 1) <= 0);
}

/** Rehberdeki rozetler: `from`dan sonra eklenen modüle "Yeni", değişene "Güncellendi". */
export function featureBadges(from: string, to: string, log: readonly ChangeEntry[] = CHANGELOG): Map<string, 'Yeni' | 'Güncellendi'> {
  const badges = new Map<string, 'Yeni' | 'Güncellendi'>();
  for (const entry of changesSince(from, to, log))
    for (const item of entry.items)
      for (const id of item.features ?? []) {
        if (item.kind === 'new') badges.set(id, 'Yeni');
        else if (item.kind === 'improved' && !badges.has(id)) badges.set(id, 'Güncellendi');
      }
  return badges;
}

/**
 * Güncellemeden sonra rehberin açılıp açılmayacağına karar verir.
 * `seen`: rehberin en son gösterildiği sürüm (yoksa null; bu özellik 0.7.0'da geldi, eski kullanıcılarda yok).
 * Dönen değer rehbere verilecek "şu sürümden beri" değeri; null ise açılmaz.
 */
export function whatsNewFrom(seen: string | null, current: string, log: readonly ChangeEntry[] = CHANGELOG): string | null {
  if (seen === current) return null;
  // Kayıt yoksa (0.7.0 öncesinden güncelleyen): yalnızca bu sürümün yeniliklerini göster.
  const from = seen && compareVersions(seen, current) !== null ? seen : previousVersion(current, log);
  if (!from || !isNewerVersion(current, from)) return null;
  return changesSince(from, current, log).length ? from : null;
}

/** Günlükte `current`tan önceki en yeni sürüm; yoksa 0.0.0. */
function previousVersion(current: string, log: readonly ChangeEntry[]): string {
  return log.find(e => isNewerVersion(current, e.version))?.version ?? '0.0.0';
}
