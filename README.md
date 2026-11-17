<img src="design/logo/LifeTools_acik_tema.svg" width="96" alt="LifeTools logosu">

# LifeTools

Yerel çalışan Chrome eklentisi ve masaüstü verimlilik araçları.

## Neyin ne olduğu

| Klasör | İçerik |
| --- | --- |
| `src/` | Chrome Manifest V3 eklentisi kaynak kodu |
| `dist/` | Derlenmiş, Chrome'a yüklenen eklenti |
| `desktop/` | Windows için Tauri 2 masaüstü uygulaması |
| `design/` | Ortak tasarım değişkenleri, bileşenler ve ikonlar |
| `tests/` | Eklenti testleri |

## Özellikler

- **Video İndirici:** YouTube ve diğer sayfalardan video veya MP3 indir; işleri Panel'den takip et.

Eklenti simgesi hızlı işlemleri, **Panel** ise araçları ve ayarlarını açar. Yeni kurulumda modüller varsayılan olarak açıktır. Ek site izni isteyen özellikler izin verildiğinde çalışır; otomatik sekme uyutma ve otomatik oturum kaydı başlangıçta kapalıdır. Kısayolları `chrome://extensions/shortcuts` üzerinden değiştirebilirsin.

### Kısaca nasıl kullanılır

<!-- design/demos/*.svg: `node scripts/readme-demos.mjs` ile src/onboarding/demos.ts'den üretilir. -->
<table>
<tr>
<td width="50%"><img src="design/demos/slapmemo.svg" width="100%" alt="SlapMemo animasyonu"><br><b>SlapMemo:</b> metni seç, baloncukta <b>📝 Not</b>'a bas.</td>
<td width="50%"><img src="design/demos/link-cleaner.svg" width="100%" alt="Link Temizleyici animasyonu"><br><b>Link Temizleyici:</b> bağlantıyı seç, <b>🔗 Temiz link</b>; takip ekleri silinip kopyalanır.</td>
</tr>
<tr>
<td><img src="design/demos/tab-manager.svg" width="100%" alt="Sekme Yöneticisi animasyonu"><br><b>Sekme Yöneticisi:</b> sekmeleri gruba al, <b>Kaydet ve kapat</b> ile kayıtlı gruplara taşı.</td>
<td><img src="design/demos/life-browser.svg" width="100%" alt="Pencere Kaydetme animasyonu"><br><b>Pencere Kaydetme:</b> penceredeki tüm sekmeleri tek kayıtlı grup yap.</td>
</tr>
<tr>
<td><img src="design/demos/time-tracker.svg" width="100%" alt="Süre takibi animasyonu"><br><b>Süre takibi:</b> sitelerde ne kadar kaldığını say; limitin %80'inde uyarır.</td>
<td><img src="design/demos/volume-booster.svg" width="100%" alt="Ses yükseltici animasyonu"><br><b>Ses yükseltici:</b> sekmenin sesini %600'e kadar aç.</td>
</tr>
<tr>
<td><img src="design/demos/pip.svg" width="100%" alt="Resim içinde resim animasyonu"><br><b>Resim içinde resim:</b> videonun köşesindeki ⧉ ile küçük pencerede izle.</td>
<td><img src="design/demos/video-downloader.svg" width="100%" alt="YouTube indirme animasyonu"><br><b>YouTube indirici:</b> videonun altındaki <b>↓ İndir</b>'den kalite seç <i>(masaüstü uygulaması gerekir)</i>.</td>
</tr>
<tr>
<td><img src="design/demos/x-video.svg" width="100%" alt="X video indirme animasyonu"><br><b>X video indirici:</b> gönderinin altındaki simgeyle tek tıkla indir.</td>
<td><img src="design/demos/instagram.svg" width="100%" alt="Instagram animasyonu"><br><b>Instagram:</b> videoyu hızlandır, ↓ ile indir.</td>
</tr>
<tr>
<td><img src="design/demos/currency.svg" width="100%" alt="Döviz animasyonu"><br><b>Döviz:</b> Steam fiyatları TL olarak görünür.</td>
<td></td>
</tr>
</table>

### Chrome eklentisi

- **SlapMemo:** Seçimi, bağlantıyı veya sayfayı not olarak kaydet; sağ tık menüsünü, seçim baloncuğunu veya `Alt+S` kullan. Notları Panel'de ara ve düzenle.
- **Akıllı Yanıtlar:** Panel'de metin şablonları oluştur; düzenlenebilir alanda sağ tıkla ekle veya izin verdiğin sitelerde tetikleyiciyi Boşluk ya da Tab ile genişlet.
- **Pano Yuvaları:** Beş metin yuvasını Panel'de düzenle; seçimi sağ tıkla kaydet veya bir alana sağ tıkla yuvadan yapıştır.
- **Link Temizleyici:** Takip parametrelerini kaldırıp temiz bağlantıyı kopyala; sağ tık menüsünü veya Panel'i kullan. Otomatik temizlik ve kısa bağlantı çözümleme site izni gerektirir.
- **İzleme Listesi:** Film, dizi ve videoları durumlarıyla takip et; Panel'den veya sağ tıkla ekle. İzin verirsen YouTube ve IMDb'deki düğmeyi de kullanabilirsin.
- **Web Süre Takibi:** Etkin olduğunda sitelerde geçirilen süreyi ölçer; Panel'de bugün ve son yedi günü, hariç tutulan siteleri ve limitleri yönet.
- **Görsel Sekme Değiştirici:** `Alt+Q` ile sekmeleri ara, seç ve kapat; penceredeki araçlarla etiket, not ve diğer sekme işlemlerine eriş.
- **LifeBrowser:** Panel'den oturumları kaydet ve geri aç, sekmeleri siteye göre grupla veya kopyaları kapat. Otomatik gruplama ve oturum kaydı ayarları da buradadır.
- **Sekme Yöneticisi:** Sabit yönetici sekmesinde çalışma alanlarını, sekmeleri ve grupları düzenle; grupları gizle veya kaydedip kapat.
- **Zombi Sekme Temizleyici:** Uzun süredir kullanılmayan sekmeleri Panel'de bul; kapat, oturuma taşı veya isteğe bağlı otomatik uyutmayı aç.
- **Sabit Sekme Koruyucu:** Kapanan sabit sekme için bildirim gösterir; bildirimden veya Panel'deki listeden geri aç.
- **Sekme Etiketleri:** Sekmelere etiket ekle; sağ tık menüsünü, Panel'i veya sekme değiştiriciyi kullan.
- **Sekme Notları:** Sayfalara kısa not ekle ve düzenle; Panel veya sekme değiştiriciden eriş, istersen kapanan sekmenin notunu SlapMemo'ya aktar.
- **Sekme Başlığı Temizleyici:** Sekme görünümlerindeki başlıkları sadeleştirir; siteye özel kuralları Panel'de düzenle.
- **Site Engelleyici:** Panel'e eklediğin X profillerini engel sayfasında açar; korumayı buradan yönet veya duraklat.
- **Resim içinde resim:** Etkin sayfadaki videoyu küçük pencerede açıp kapat; `Alt+P`, Panel veya Komut Merkezi'ni kullan.
- **X Video İndirici:** Tek tıkla en yüksek kalitede indir; ok düğmesinden kalite, GIF ve toplu indirme seçeneklerine ulaş. Panel'den kalite sorulmasını ve indirme alt klasörünü ayarla.
- **Instagram:** Video üzerindeki indirme düğmesiyle tek veya birden çok video indir; X Video İndirici'deki ortak indirme klasörü ayarını kullan. İlerleme çubuğuna tıkla veya sürükle, fare video üzerindeyken oklarla beş saniye sar.
- **Komut Merkezi:** `Alt+K` ile eylem, sekme, not ve şablon ara; `not` veya `izle` gibi komutlarla hızlı işlem yap.
- **Site Araç Çubuğu:** Panel'de site ve eylemleri seçip izin ver; sitedeki sürüklenebilir **LT** düğmesinden eylemleri aç.
- **Kısayol Oluşturucu:** Panel'de komutları ve atamalarını gör; Chrome'un kısayol sayfasında tuşları düzenle.

Metin seçimi baloncuğu not, izleme, link ve pano işlemlerinin yanında çeviri ve arama sunar. Panel'deki **Yedek** ile verileri dışa aktarabilir veya geri yükleyebilirsin; otomatik yedek ayarı da bulunur.

### Masaüstü

- **Ana sayfa:** Özet kartlarını ve hızlı erişimleri gösterir; uygulamayı açınca buradan ilgili bölüme geç.
- **Pano geçmişi:** Kopyalanan metinleri ara, sabitle veya sil; `Ctrl+Alt+V` seçiciden panoya geri kopyalar.
- **Şablonlar:** Bölümde şablon oluştur; `Ctrl+Shift+Space` ile seçip etkin uygulamaya yapıştır.
- **Piller:** Piller bölümünde Windows'un bildirdiği sistem ve Bluetooth pil düzeylerini gör ve yenile.
- **Ortam sesi:** Ses kanallarını, seviyeleri ve zamanlayıcıyı seç; ön ayarları kaydet veya tepsiden oynatmayı kontrol et.
- **Ayarlar:** Başlangıç, pano saklama ve gizlilik seçeneklerini, temayı, yedeği ve Chrome bağlantısını yönet.

## Gizlilik

Veriler yerel olarak tutulur: eklenti SQLite'ı tarayıcının OPFS alanını, masaüstü uygulaması yerel SQLite dosyasını kullanır. İsteğe bağlı bağlantıyla eklenti verileri masaüstü veritabanına taşınabilir. Telemetri yoktur; çeviri, kısa bağlantı çözümleme ve seçilen medya indirmeleri gibi ağ gerektiren işlemler ilgili servislere erişir. Pano geçmişi yerel veritabanında şifrelenmeden saklanır.

## Kurulum

### Hazır sürümden (önerilen)

Chrome 116 veya üzeri gerekir. Releases sayfasından `LifeTools-extension.zip` dosyasını indir ve bir klasöre çıkar. `chrome://extensions` sayfasında **Geliştirici modu**nu aç, **Paketlenmemiş öğe yükle** seçeneğine tıkla ve çıkarılan klasörü seç.

Windows masaüstü uygulaması için Releases sayfasındaki `LifeTools_<version>_x64-setup.exe` dosyasını çalıştır. İmzalanmamış yükleyici için Windows SmartScreen uyarısı çıkarsa **Daha fazla bilgi → Yine de çalıştır** seçeneğini kullan. Masaüstü uygulaması yalnızca Windows içindir.

### Kaynaktan derleme

Node.js 20 veya üzeri ve Chrome 116 veya üzeri gerekir. Depo kökünde:

```sh
npm install
npm run build
```

`chrome://extensions` sayfasında **Geliştirici modu**nu aç ve **Paketlenmemiş öğe yükle** ile `dist/` klasörünü seç. Masaüstü uygulaması için [desktop/README.md](desktop/README.md) dosyasına bak.

## İlk kurulumdan sonra

Video indirmek için masaüstü uygulaması açık ve Chrome bağlantısı kurulmuş olmalıdır. İlk kullanımda Panel'den veya araçlar eksik bildiriminden yt-dlp ve ffmpeg araçlarını indirebilirsin.

Chrome araç çubuğundaki yapboz simgesinden LifeTools'u sabitle; eklenti simgesine tıklayıp **Panel**'i aç.

Bazı özellikler ek site izni ister. İlgili seçeneği Panel'de açtığında veya site eklediğinde Chrome'un izin isteğini onayla:

- **Akıllı Yanıtlar** ve **Site Araç Çubuğu:** Kullanılacak siteleri ekle.
- **İzleme Listesi:** YouTube ve IMDb sayfa düğmesini aç.
- **SlapMemo:** Metin seçimi baloncuğunu veya notu olan sayfalarda hatırlatmayı aç.
- **Link Temizleyici:** Otomatik temizlik veya kısa bağlantı çözümlemeyi aç.
- **Resim içinde resim:** Videoların üzerindeki düğmeyi aç.

X ve Instagram için gerekli site erişimi eklentinin kurulum izinleri arasındadır. Varsayılan kısayollar: `Alt+S` seçimi veya sayfayı kaydeder, `Alt+Q` sekme değiştiriciyi, `Alt+K` Komut Merkezi'ni açar, `Alt+P` resim içinde resmi açıp kapatır. Diğer komutlara da kısayol atayabilir ve bunları `chrome://extensions/shortcuts` üzerinden değiştirebilirsin.

İsteğe bağlı masaüstü bağlantısı için masaüstünde **Ayarlar → Chrome bağlantısı → Bağla**, ardından eklentide **Panel → Depolama → Verileri masaüstüne taşı** seçeneğini kullan.

## Geliştirme

```sh
npm run typecheck
npm test
```

## Sürüm yayınlama ve otomatik güncelleme

Sürümü `package.json`, `src/manifest.json`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json` ve `desktop/src-tauri/Cargo.toml` dosyalarında güncelle; npm ve Cargo kilit dosyalarını da buna uygun güncelle. Değişiklikleri commit'ledikten sonra etiketi oluşturup gönder:

```sh
git tag vX.Y.Z && git push origin vX.Y.Z
```

GitHub deposunda `TAURI_SIGNING_PRIVATE_KEY` ve `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret'ları tanımlı olmalıdır. Özel anahtar yalnızca bakım sorumlusunun `%USERPROFILE%\.lifetools-keys\updater.key` dosyasında bulunur; hiçbir zaman commit'lenmemelidir.

Arkadaşların uygulamayı Releases sayfasından bir kez kurar ve eklentiyi `chrome://extensions` üzerinden paketlenmemiş olarak `%LOCALAPPDATA%\LifeTools\extension` klasöründen yükler. Bundan sonra masaüstü uygulaması ve eklenti otomatik güncellenir.
