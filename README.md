# LifeTools — v0.1 iskeleti

Chrome (Manifest V3) eklentisi. Yalnızca Chrome hedeflenir. Ağ isteği, uzaktan kod veya analitik yoktur.

## İçerik

- TypeScript (strict) + esbuild; çıktı `dist/` (paketlenmemiş eklenti).
- Modül sistemi (`src/modules/<id>/`): her araç `id`, Türkçe ad ve arka plan başlatıcısı tanımlar; açık/kapalı durumu `chrome.storage.local` içinde tutulur. Kapalı modülün dinleyicileri hiçbir şey yapmaz.
- Site engelleyici modülü: eski X sekme kapatma prototipinin (`legacy-x-prototype/`) TypeScript'e taşınmış hâli.
- SQLite katmanı (`src/db/`): resmî `@sqlite.org/sqlite-wasm`, OPFS (`opfs-sahpool`) üzerinde kalıcı; offscreen belgedeki Worker içinde çalışır. `exec` / `query` API'si, `meta` tablosunda `schema_version` ve migrasyon çalıştırıcısı.
- Popup: araç listesi (aç/kapat), site engelleyici paneli ve "Veritabanı durumu" satırı.

## SlapMemo (hızlı not)

Seçili metni, bağlantıyı veya sayfayı kategorili not olarak kaydeder (Notlar, Okunacaklar, İzlenecekler, Fikirler). Notlar yerel SQLite'ta tutulur; arama FTS5 ile, Türkçe karakterlere duyarsızdır (`calisma` → `çalışma`).

- **Sağ tık:** metin seç / bağlantıya veya sayfaya sağ tık → *SlapMemo'ya kaydet* → kategori.
- **Klavye:** `Alt+Shift+S` seçili metni "Notlar"a kaydeder (kısayol `chrome://extensions/shortcuts` içinden değiştirilebilir).
- **Popup:** hızlı not kutusu, kategori sekmeleri, arama, "notum" alanı ve silme.

Kayıt sonrası eklenti simgesinde kısa süre `✓` (kaydedildi), `=` (zaten kayıtlı) veya `!` (hata/boş seçim) görünür.

## Link Temizleyici

Sağ tık menüsünden bağlantının veya sayfanın temiz linkini kopyala.
Popup'ta etkin sayfanın ya da yapıştırdığın linkin temiz sürümünü gör ve kopyala.

## Akıllı Yanıtlar

Popup üzerinden `/iade` veya `;adres` gibi tetikleyicilerle Şablon ekleyebilir, arayabilir ve düzenleyebilirsin. Düzenlenebilir bir alanda sağ tık → **Şablon ekle** ile metni ekle. Yazarken genişletme için siteyi popup'ta ekleyip istenen site iznini ver; yeni açılan sayfada tetikleyicinin ardından Space veya Tab kullan. Metin yalnızca eklenir, gönderilmez.

## Hızlı Görevler

Popup'tan görev ve isteğe bağlı tarih ekle; açık görevleri tamamla, sil veya tamamlananları temizle. İstersen etkin sayfanın bağlantısını ekle. Sayfa, seçim veya bağlantı üzerinde sağ tık → **Görev olarak ekle** ile de kaydedebilirsin. Görevler yerel SQLite veritabanında saklanır.

## Web S?re Takibi

Odakl? Chrome penceresinin etkin sekmesinde, kullan?c? aktifken ge?irilen s?reyi bug?n veya son yedi g?n i?in g?sterir. Siteleri hari? tutabilir ve verileri silebilirsin. Yaln?zca alan ad? ve s?re yerel olarak saklan?r; ziyaret edilen sayfalar?n adresleri kaydedilmez ve a? iste?i yap?lmaz.

## LifeBrowser

Popup'tan geçerli penceredeki tüm sekmeleri (adres, başlık, sabitlenme, sekme grubu adı/rengi) bir adla **Oturumu kaydet**; istersen **Kaydet ve kapat** ile pencereyi de kapat. Kayıtlı oturumu **Aç** ile yeni pencerede sekme gruplarıyla birlikte geri aç veya **Sil**. **Siteye göre grupla**, gruplanmamış sekmeleri sitesine göre (www yok sayılır, en az 2 sekme) Chrome sekme gruplarına toplar; sabit sekmelere dokunmaz. **Kopya sekmeler** listesi aynı adresli sekmeleri (# kısmı yok sayılır) gösterir; **Kopyaları kapat** ilkini tutar. Oturumlar yerel SQLite'ta saklanır ve yedeğe dahildir.

## Zombi Sekme Temizleyici

Her sekmenin en son ne zaman etkin olduğunu (oturum belleğinde, yoksa Chrome'un `lastAccessed` bilgisiyle) izler. Popup, belirlediğin saatten (varsayılan 24) uzun süredir açılmayan sekmeleri listeler: tek tek veya topluca **Kapat** ya da **Oturuma taşı** (LifeBrowser'da "Zombi sekmeler <tarih>" oturumuna kaydedip kapatır). Sabit, ses çalan ve etkin sekmeler asla önerilmez.

## Sabit Sekme Koruyucu

Chrome sekme kapatmayı engelleyemez; bu yüzden sabit sekmeleri hatırlar ve biri kapanınca (pencerenin tamamı kapanırken değil) "Sabit sekme kapandı" bildirimi gösterir. **Geri aç** sekmeyi aynı pencerede (yoksa son odaklı pencerede) en başa sabit olarak açar. Popup'ta son kapanan 10 sabit sekme listelenir.

## Yedekleme ve geri yükleme

Popup'taki **Yedek** bölümünde **Yedeği indir** ile verilerini ve modül ayarlarını JSON dosyası olarak kaydet. Geri yüklemek için dosyayı seç, kayıt sayılarını incele ve **Evet, geri yükle** düğmesine bas. Mevcut veriler ve ayarlar değiştirilir; eklenti yeniden başlatılır. Site izinleri Chrome tarafından yönetilir ve gerekirse yeniden verilmelidir.

Eklentiyi kaldırmak yerel verilerini siler. Verilerini korumak için kaldırmadan önce yedek indir.

## Kurulum ve derleme

```
npm install
npm run build
```

## Eklentiyi yükleme

1. `chrome://extensions` adresini aç.
2. **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** ile `dist/` klasörünü seç.

## Test

```
npm test          # birim testleri (vitest)
npm run typecheck # tür denetimi
```

## Sekme araçları

Görsel sekme değiştiriciyi popup'tan veya Alt+Shift+Space ile aç. Başlık, adres, etiket ve notlarda ara; yön tuşları ve Enter ile geç, Delete ile seçili sekmeyi kapat.

Popup'tan sekmeye etiket veya kısa not ekle; sağ tık menüsünden hazır etiketleri seç. Adresin # bölümü yok sayılır. İstersen sekme kapanınca notu SlapMemo'ya aktar. Başlık temizleyicinin siteye özel kurallarını popup'ta her satıra bir metin olarak düzenle. Bu veriler ve ayarlar yerel yedeğe dahildir.
