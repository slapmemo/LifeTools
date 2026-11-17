/** Özellik rehberi: her modül için bölüm, örnek kullanım, nerede bulunduğu ve (varsa) kısayol komutları. */
export interface FeatureGuide {
  category: GuideCategory;
  example: string;
  where: string;
  /** manifest'teki komut adları; tuşlar Chrome'dan canlı okunur (kullanıcı değiştirmiş olabilir). */
  commands?: readonly string[];
  needsDesktop?: boolean;
}
export type GuideCategory = 'Notlar' | 'Metin' | 'Sekmeler' | 'Odak' | 'Medya' | 'Genel';
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ['Notlar', 'Metin', 'Sekmeler', 'Odak', 'Medya', 'Genel'];

export const FEATURE_GUIDE: Readonly<Record<string, FeatureGuide>> = {
  slapmemo: { category: 'Notlar', example: 'Bir sayfada metni seç, altında çıkan baloncukta "📝 Not"a bas (ya da Alt+S). Not, sayfanın bağlantısıyla birlikte kaydedilir.', where: 'Sağ tık menüsü · açılır pencere › Hızlı not · Panel › Notlar', commands: ['save-selection'] },
  watchlist: { category: 'Notlar', example: 'Bir film ya da dizi sayfasındaki "+ İzle" düğmesine bas; listede İzlenecek / İzleniyor / Bitti diye takip et.', where: 'Film/dizi/video sayfaları · Panel › Notlar › İzleme listesi' },
  'smart-replies': { category: 'Metin', example: '"/merhaba" gibi bir kısaltmaya uzun bir metin kaydet. Seçtiğin sitelerde /merhaba yazıp Space\'e basınca metnin tamamı gelir; ya da metin kutusuna sağ tıklayıp "Şablon ekle".', where: 'Sağ tık menüsü · Panel › Metin › Şablonlar' },
  'clip-slots': { category: 'Metin', example: 'Sık yapıştırdığın 5 metni (IBAN, adres, imza…) yuvalara kaydet; metin kutusunda sağ tık › "Yuvadan yapıştır".', where: 'Sağ tık menüsü · Panel › Metin › Pano yuvaları' },
  'link-cleaner': { category: 'Metin', example: 'Paylaşacağın bağlantıdaki ?utm_source=… gibi takip eklerini silip temiz hâlini kopyalar.', where: 'Sağ tık menüsü · Panel › Metin › Link temizle', commands: ['action-link-copy'] },
  'tab-manager': { category: 'Sekmeler', example: 'Açık sekmeleri seçip gruba al, rengini ve adını değiştir; "Kaydet ve kapat" ile sonra tek tıkla geri açmak üzere kayıtlı gruplara at.', where: 'Açılır pencere › Sekme Yöneticisi · her pencerenin başındaki sabit sekme', commands: ['save-tab-to-group'] },
  'life-browser': { category: 'Sekmeler', example: 'Penceredeki tüm sekmeleri tek seferde kayıtlı grup yap; istersen pencere kapanınca kendiliğinden kaydetsin. Aynı sitedeki sekmeleri grupla, kopya sekmeleri kapat.', where: 'Panel › Sekmeler › Kaydet', commands: ['action-session-save', 'action-group-site'] },
  'zombie-tabs': { category: 'Sekmeler', example: 'Günlerdir açmadığın sekmeleri bulur; hepsini kapat ya da kayıtlı gruba taşı. İstersen haftada bir hatırlatır.', where: 'Panel › Sekmeler › Temizlik' },
  'tab-labels': { category: 'Sekmeler', example: 'Sekmeye "Önemli" ya da "Sonra oku" gibi bir etiket koy; etiket sekme başlığında görünür.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'tab-notes': { category: 'Sekmeler', example: 'Bir sekmeye kısa not iliştir ("fiyatı düşerse al" gibi); sayfayı tekrar açınca not hatırlatılır.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'title-cleaner': { category: 'Sekmeler', example: 'Sekme başlıklarındaki "(3)" bildirim sayaçlarını ve " - YouTube" gibi ekleri gizler; sekmeler daha okunur olur.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'site-toolbar': { category: 'Sekmeler', example: 'Seçtiğin sitelerde ekranın kenarında küçük, sürüklenebilir bir çubuk çıkar; içine "temiz link kopyala", "not al" gibi eylemleri koyarsın.', where: 'Panel › Sekmeler › Araç çubuğu' },
  'site-blocker': { category: 'Odak', example: 'Dikkatini dağıtan X profillerini ekle; o profillere girince engel sayfası açılır. X profillerinde hızlı "Engelle" düğmesi de çıkar.', where: 'Panel › Odak › Engelleyici', commands: ['action-blocker-toggle'] },
  'time-tracker': { category: 'Odak', example: 'Hangi sitede ne kadar vakit geçirdiğini kendiliğinden sayar; günlük limit koyarsan %80\'de ve dolunca uyarır.', where: 'Açılır pencere › Bugün · Panel › Odak › Süreler · masaüstü Ana sayfa' },
  'video-downloader': { category: 'Medya', example: 'YouTube\'da videonun altındaki "İndir" düğmesiyle videoyu ya da sesini indir; oynatma listelerini de indirebilir.', where: 'YouTube sayfaları · sağ tık › "Bu sayfadaki videoyu indir" · Panel › Medya', needsDesktop: true },
  'x-video': { category: 'Medya', example: 'X\'teki bir videonun üstündeki indirme düğmesiyle videoyu (ya da GIF\'i) kaydet.', where: 'X (Twitter) sayfaları · Panel › Medya' },
  instagram: { category: 'Medya', example: 'Instagram\'daki videolarda indirme düğmesi ve hız / ilerleme kontrolleri çıkar.', where: 'Instagram sayfaları · Panel › Medya' },
  pip: { category: 'Medya', example: 'Videonun üstüne gelince sağ üstte çıkan ⧉ düğmesine bas; video küçük pencerede başka işler yaparken oynamaya devam eder.', where: 'Video olan sayfalar · Panel › Medya', commands: ['toggle-pip'] },
  'volume-booster': { category: 'Medya', example: 'Sesi çok kısık bir videonun sesini %600\'e kadar aç; 100 / 200 / 400 hazır düğmeleri var.', where: 'Açılır pencere › Bu sekmenin sesi' },
  currency: { category: 'Medya', example: 'Steam\'de fiyatların yanında TL karşılığı görünür; istersen her sitede fiyatın üstüne gelince TL\'sini gösterir.', where: 'Steam ve (izin verirsen) tüm siteler · Panel › Medya' },
  shortcuts: { category: 'Genel', example: 'Yukarıdaki kısayolların çalışmasını sağlar; tuşları Chrome\'un kısayol sayfasından değiştirebilirsin.', where: 'Panel › Ayarlar › Kısayollar' }
};

/** İlk kurulum sonunda önerilen kısa denemeler. */
export const FIRST_STEPS: readonly { title: string; text: string }[] = [
  { title: 'İlk notunu kaydet', text: 'Herhangi bir sayfada bir cümle seç, altında çıkan baloncukta "📝 Not"a bas.' },
  { title: 'Sekmelerini topla', text: 'Açılır pencerede "Sekme Yöneticisi"ne bas; dağınık sekmeleri gruba al ya da kaydedip kapat.' },
  { title: 'Bugününe bak', text: 'Birkaç dakika gezindikten sonra açılır penceredeki "Bugün" kartında hangi sitede ne kadar kaldığını gör.' }
];
