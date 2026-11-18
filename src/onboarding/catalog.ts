/** Özellik rehberi: her modül için bölüm, örnek kullanım, nerede bulunduğu ve (varsa) kısayol komutları. */
export interface FeatureGuide {
  category: GuideCategory;
  example: string;
  where: string;
  /** manifest'teki komut adları; tuşlar Chrome'dan canlı okunur (kullanıcı değiştirmiş olabilir). */
  commands?: readonly string[];
  needsDesktop?: boolean;
  /** Örnekte anlatılmayan, bilmeye değer kullanımlar (rehberde açılır liste). */
  tips?: readonly string[];
}
export type GuideCategory = 'Notlar' | 'Metin' | 'Sekmeler' | 'Odak' | 'Medya' | 'Genel';
export const GUIDE_CATEGORIES: readonly GuideCategory[] = ['Notlar', 'Metin', 'Sekmeler', 'Odak', 'Medya', 'Genel'];

export const FEATURE_GUIDE: Readonly<Record<string, FeatureGuide>> = {
  slapmemo: { category: 'Notlar', example: 'Bir sayfada metni seç, yanında çıkan baloncukta "📝 Not"a bas (ya da Alt+S). Not, sayfanın bağlantısıyla birlikte kaydedilir.', where: 'Sağ tık menüsü · açılır pencere › Hızlı not · Panel › Notlar', commands: ['save-selection'] , tips: [
    "Baloncukta nottan başka düğmeler de var: 🔎 Ara, 🌐 Çevir (çeviriyi de not olarak kaydedebilirsin), adres seçiliyse 📍 Haritada aç, bağlantı seçiliyse 🔗 Temiz link, 📋 Yuva (beş pano yuvasından birine kaydet).",
    "Bir fiyat seçersen baloncukta TL karşılığı çıkar; üstüne tıklayınca kopyalanır.",
    "Baloncuk bir sitede rahatsız ediyorsa ⋯ › \"Bu sitede gösterme\"; Panel › Notlar'dan geri açabilirsin."
  ] },
  watchlist: { category: 'Medya', example: 'Bir film ya da dizi sayfasındaki "+ İzle" düğmesine bas; listede İzlenecek / İzleniyor / Bitti diye takip et.', where: 'Film/dizi/video sayfaları · Panel › Medya' },
  'smart-replies': { category: 'Metin', example: '"/merhaba" gibi bir kısaltmaya uzun bir metin kaydet. Seçtiğin sitelerde /merhaba yazıp Space\'e basınca metnin tamamı gelir; ya da metin kutusuna sağ tıklayıp "Şablon ekle".', where: 'Sağ tık menüsü · Panel › Metin › Metin kısayolları' },
  'clip-slots': { category: 'Metin', example: 'Sık yapıştırdığın 5 metni (IBAN, adres, imza…) yuvalara kaydet; metin kutusunda sağ tık › "Yuvadan yapıştır".', where: 'Sağ tık menüsü · Panel › Metin › Pano yuvaları' },
  'link-cleaner': { category: 'Metin', example: 'Paylaşacağın bağlantıdaki ?utm_source=… gibi takip eklerini silip temiz hâlini kopyalar.', where: 'Sağ tık menüsü · Panel › Metin › Link temizle', commands: ['action-link-copy'] },
  'tab-manager': { category: 'Sekmeler', example: 'Sekmeleri seçip Chrome gruplarına taşı veya tüm pencereyi kayıtlı grup olarak sakla. İstersen pencere kapanınca otomatik kaydet; kayıtlı grupları aç, düzenle ve gerektiğinde sekme bazında değiştir.', where: 'Açılır pencere › Sekme Yöneticisi', commands: ['save-tab-to-group', 'action-session-save', 'action-group-site'] , tips: [
    'Arama kutusunun altındaki site haplarıyla (Tümü · YouTube 7 · X 2 · Diğer) açık sekmeleri siteye göre süz; aramayla birlikte de çalışır.',
    'Bir sekmeyi tutup başka bir gruba sürükle: o gruba taşınır. Başka bir pencereye de bırakabilirsin; satırların arasına bırakırsan sırası değişir.',
    'Sekmeyi aşağıdaki Kayıtlı gruplar\'dan birine bırak: oraya kaydedilir ve kapanır. Yanlışlıkla olduysa çıkan "Geri al"a bas.',
    'Kayıtlı bir sekmeyi yukarıdaki pencereye sürükle: orada açılır ve kayıttan çıkar. Kayıtlı gruplar arasında da sürükleyerek taşıyabilirsin.',
    'Shift ile tıklayarak arka arkaya sekmeleri seç; seçtiklerini birlikte sürükle (tuttuğun satırın üstünde kaç sekme olduğu yazar).',
    '"Gruba ekle ▾" ile seçtiklerini açık bir gruba ya da kayıtlı bir gruba gönder.',
    'Kayıtlı grupları "Sırala: Elle" iken sürükleyerek sırala. "Siteye göre" görünümünde bir sitenin bütün sekmelerini (ör. YouTube 7) tek seferde başka gruba sürükle.',
    'Kısayolla o anki sekmeyi "Kısayol grubu"na kaydedip kapat; varsayılan grup "Sonra". Tuşu chrome://extensions/shortcuts\'tan ata.',
    'Kayıtlı sekmeye 📝 ile not ekle; "Aç" sekmeyi açar ve listeden kaldırır.'
  ] },
  'zombie-tabs': { category: 'Sekmeler', example: 'Günlerdir açmadığın sekmeleri bulur; hepsini kapat ya da kayıtlı gruba taşı. İstersen haftada bir hatırlatır.', where: 'Panel › Sekmeler › Temizlik' },
  'tab-labels': { category: 'Sekmeler', example: 'Sekmeye "Önemli" ya da "Sonra oku" gibi bir etiket koy; etiket sekme başlığında görünür.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'tab-notes': { category: 'Sekmeler', example: 'Bir sekmeye kısa not iliştir ("fiyatı düşerse al" gibi); sayfayı tekrar açınca not hatırlatılır.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'title-cleaner': { category: 'Sekmeler', example: 'Sekme başlıklarındaki "(3)" bildirim sayaçlarını ve " - YouTube" gibi ekleri gizler; sekmeler daha okunur olur.', where: 'Panel › Sekmeler › Etiket ve notlar' },
  'site-toolbar': { category: 'Sekmeler', example: 'Seçtiğin sitelerde ekranın kenarında küçük, sürüklenebilir bir çubuk çıkar; içine "temiz link kopyala", "not al" gibi eylemleri koyarsın.', where: 'Panel › Sekmeler › Araç çubuğu' },
  'site-blocker': { category: 'Odak', example: 'Dikkatini dağıtan X profillerini ekle; o profillere girince engel sayfası açılır. X profillerinde hızlı "Engelle" düğmesi de çıkar.', where: 'Panel › Odak › Engelleyici', commands: ['action-blocker-toggle'] },
  'time-tracker': { category: 'Odak', example: 'Hangi sitede ne kadar vakit geçirdiğini kendiliğinden sayar; günlük limit koyarsan %80\'de ve dolunca uyarır.', where: 'Açılır pencere › Bugün · Panel › Odak › Süreler · masaüstü Ana sayfa' },
  'video-downloader': { category: 'Medya', example: 'YouTube\'da videonun altındaki "İndir" düğmesiyle videoyu ya da sesini indir; oynatma listelerini de indirebilir.', where: 'YouTube sayfaları · sağ tık › "Bu sayfadaki videoyu indir" · Panel › Medya', needsDesktop: true , tips: [
    "Oynatma listesi sayfasında \"↓ Listeyi indir\" ile listenin tamamını (en iyi kalite, 720p ya da MP3) indir.",
    "\"Videoları seç…\" ile listeden istediğin videolara tıkla; altta \"N video seçildi\" çubuğu çıkar, oradan indir.",
    "Shorts'ta da ↓ İndir düğmesi var.",
    "İndirmenin ilerlemesi düğmenin yanında görünür; × ile iptal et. Biten indirmeler Panel › Medya'da."
  ] },
  'x-video': { category: 'Medya', example: 'X\'teki bir videonun üstündeki indirme düğmesiyle videoyu (ya da GIF\'i) kaydet.', where: 'X (Twitter) sayfaları · Panel › Medya' , tips: [
    "İndirme simgesinin yanındaki ▾ ile kaliteyi seç; her kalitenin yanında yaklaşık boyutu (MB) yazar.",
    "GIF'leri \"GIF olarak indir\" ile gerçek GIF dosyası olarak kaydet; birden çok videolu gönderide \"Hepsini indir (N)\".",
    "Panel › Medya'da \"Kalite sor\"u açarsan simgeye basınca da kalite menüsü çıkar; indirme klasörünü (X ve Instagram ortak) de oradan seç."
  ] },
  instagram: { category: 'Medya', example: 'Instagram\'daki videolarda indirme düğmesi ve hız / ilerleme kontrolleri çıkar.', where: 'Instagram sayfaları · Panel › Medya' , tips: [
    "Fare videonun üstündeyken ← ve → tuşlarıyla 5 saniye geri ya da ileri sar.",
    "Videonun altındaki ilerleme çubuğuna tıklayarak ya da sürükleyerek istediğin yere atla; üstüne gelince o anın süresi görünür.",
    "Hız düğmesinin üstünde fare tekerleğini çevirerek hızı değiştir (0,5× ile 3× arası); tıklayınca hız listesi açılır.",
    "Birden çok videolu gönderide ↓ düğmesi \"Hepsini indir (N)\" ya da tek tek video seçtirir.",
    "İndir düğmesini, ilerleme çubuğunu ve hız düğmesini Panel › Medya'dan ayrı ayrı kapatabilirsin."
  ] },
  pip: { category: 'Medya', example: 'Videonun üstüne gelince sağ üstte çıkan ⧉ düğmesine bas; video küçük pencerede başka işler yaparken oynamaya devam eder.', where: 'Video olan sayfalar · Panel › Medya', commands: ['toggle-pip'] },
  'volume-booster': { category: 'Medya', example: 'Sesi çok kısık bir videonun sesini %600\'e kadar aç; 100 / 200 / 400 hazır düğmeleri var.', where: 'Açılır pencere › Bu sekmenin sesi' },
  currency: { category: 'Medya', example: 'Steam\'de fiyatların yanında TL karşılığı görünür; istersen her sitede fiyatın üstüne gelince TL\'sini gösterir.', where: 'Steam ve (izin verirsen) tüm siteler · Panel › Medya' , tips: [
    "Steam'de fiyata tıklayınca dolar ile TL arasında geçiş yapar.",
    "Fiyatın üstüne gelince asıl fiyat ve kullanılan kur (ECB, tarihiyle) yazar."
  ] },
  shortcuts: { category: 'Genel', example: 'Yukarıdaki kısayolların çalışmasını sağlar; tuşları Chrome\'un kısayol sayfasından değiştirebilirsin.', where: 'Panel › Ayarlar › Kısayollar' }
};

/** İlk kurulum sonunda önerilen kısa denemeler. */
export const FIRST_STEPS: readonly { title: string; text: string }[] = [
  { title: 'İlk notunu kaydet', text: 'Herhangi bir sayfada bir cümle seç, yanında çıkan baloncukta "📝 Not"a bas.' },
  { title: 'Sekmelerini topla', text: 'Açılır pencerede "Sekme Yöneticisi"ne bas; dağınık sekmeleri gruba al ya da kaydedip kapat.' },
  { title: 'Bugününe bak', text: 'Birkaç dakika gezindikten sonra açılır penceredeki "Bugün" kartında hangi sitede ne kadar kaldığını gör.' }
];
