# Notlar geliştirme planı

> **Durum (24 Kasım):** 0.8.2 + 0.9.0 + 0.10.0 bitti ve **0.10.0** olarak tek sürümde çıktı. **Sırada 0.11.0.** Ayrıntı DURUM.md §0.
> Yazıldı: 24 Kasım 2026 · başlangıç sürümü 0.8.1 · kapsam: masaüstü Notlar (`desktop/src/views/notlar.ts`), eklenti panelindeki Notlar (`src/modules/slapmemo/`), hızlı not penceresi (`desktop/src/quicknote.ts`), tarayıcıdan not alma (baloncuk, sağ tık).
> Maddelerin numaraları kullanıcıyla konuşulan listeden geliyor; sohbet dışında da anlaşılsın diye her maddenin adı yazıldı.
> Görsel örnek (Word gibi yazma, liste/kart, hızlı süzgeçler): https://claude.ai/artifact/TiVXkkBWCYrW2L9CnJFYiz. Kullanıcı "tam istediğim gibi" dedi; düzenleyici bu davranışı örnek alır.

## 1. Kapsam

| No | Madde | Sürüm |
|---|---|---|
| A | Notlardaki boş satırların görünmesi (panelde satır sonları da kayboluyor) | 0.8.2 |
| 9 | Word gibi yazma: seçince üst çubuk ve seçimin üstünde küçük çubuk; yazarken biçimli görünür | 0.9.0 |
| 10 | Tablo ekleme | 0.9.0 |
| 47 | Tabloyu düzenleme (satır/sütun ekle-sil, sağ tık) | 0.9.0 |
| 30 | Yapıştırırken temizleme (biçim kalsın, yabancı yazı tipi/renk/boyut gitsin; Ctrl+Shift+V düz metin) | 0.9.0 |
| 31 | Yazarken kendiliğinden biçim (`# `, `- `, `[] `, `**…**`) | 0.9.0 |
| 33 | Biçim boyacısı | 0.9.0 |
| 34 | Not içinde bul ve değiştir (Ctrl+F / Ctrl+H) | 0.9.0 |
| 45 | Otomatik kaydetme ("Kaydedildi" göstergesi, Kaydet düğmesi yok) | 0.9.0 |
| 2 | Taslağı hatırlama (yeni not yazarken pencere kapanırsa kaybolmaz) | 0.9.0 |
| 8 | Kelime/karakter sayacı ve odak modu (tam ekran yazma) | 0.9.0 |
| 1 | Eklenti panelinde de biçimli görünüm | 0.9.0 |
| 41 | Notu çoğaltma | 0.9.0 |
| B | Çöp kutusu: silinen not 15 gün durur, geri yüklenebilir | 0.10.0 |
| 14 | Kendi kategorilerin: ekle, adını/rengini değiştir, sil | 0.10.0 |
| 6 | Renkli not | 0.10.0 |
| 7 | Düzenleme geçmişi (önceki hâle dönme) | 0.10.0 |
| 18 | Elle sıralama (sürükle-bırak) | 0.10.0 |
| 15 | Kart görünümü (liste/kart geçişi) | 0.11.0 |
| 17 | Hızlı süzgeçler (hatırlatmalı, yapılacak içeren, bitmemiş, görselli, bağlantılı, bu hafta) | 0.11.0 |
| 16 | Etiket yönetimi (liste, yeniden adlandırma, silme) | 0.11.0 |
| 39 | Aramada vurgulama ve bulunan yere gitme | 0.11.0 |
| 4 | Toplu işlem (seç: sil, arşivle, kategori, renk) | 0.11.0 |
| 19 | Notlar arası bağlantı (`[[`) ve "bu nottan bahsedenler" | 0.11.0 |
| 37 | Katlanabilir başlıklar | 0.11.0 |
| 3 + 35 | Ctrl+V ile görsel yapıştırma; görsel metnin içinde, boyutu değiştirilebilir | 0.12.0 |
| 5 | Dışa aktarma (.md / .txt; tek not, kategori, tümü) | 0.12.0 |
| 28 | İçe aktarma (.md / .txt, Google Keep Takeout) | 0.12.0 |
| 12 | Not şablonları (hazırlar + kendi şablonun) | 0.12.0 |
| 49 | Tarayıcıdan kaydederken "Şu nota ekle" | 0.13.0 |
| 50 | Sitede seçilen metni biçimiyle kaydetme | 0.13.0 |
| 51 | Bağlantıyı sayfa başlığıyla yapıştırma | 0.13.0 |
| 52 | Masaüstünde notu ayrı pencerede açma | 0.13.0 |
| 29 | Parolalı (şifreli) not | ileride |

**Plana girmeyenler:** 11 yazım denetimi, 13 günün notu, 20 tekrarlayan hatırlatma, 21 bildirimde ertele, 22 ilerleme çubuğu, 23 hatırlatma takvimi, 24 hızlı not penceresine ayrı biçim çubuğu (düzenleyici 9 ile oraya zaten gelir), 25 bu sayfanın notları, 26 QR, 27 yazdırma, 32 "/" menüsü, 36 içindekiler, 38 okuma ayarları, 40 gelişmiş arama, 42 birleştir/böl, 43 salt okunur kilit, 44 dosya ekleme, 46 iç içe liste (düzenleyicide Tab ile girinti kendiliğinden gelirse kapatılmaz, ama ayrıca iş yapılmaz), 48 kısayol listesi.

## 2. Temel kararlar

1. **Kayıt biçimi Markdown kalır.** Düzenleyici ekranda biçimli gösterir, veritabanına Markdown yazar. Eklenti ve masaüstü aynı metni okur; tam metin arama (`notes_fts`, `unicode61`) noktalama işaretlerini zaten yok saydığı için `**kalın**` "kalın" aramasında bulunur.
2. **Markdown'da olmayanlar için LifeTools ekleri** (kullanıcı kabul etti; dışa aktarılan dosyada düz yazı görünür):
   - altı çizili `++metin++`
   - vurgu `==metin==`
   - renkli yazı `{kırmızı|metin}`; renkler sabit bir paletten (kırmızı, mavi, yeşil, turuncu, mor, gri), ad olarak saklanır ki temaya göre çizilebilsin
   - üstü çizili `~~metin~~`, tablo, `---` (GFM'den)
   - notlar arası bağlantı `[[Başlık]](lt-note:42)`; görsel `![](lt-img:7)` (0.11.0 / 0.12.0'da gelir)
   - Hepsi `docs/not-bicimi.md` adında tek bir belgede tanımlanır; çizici, düzenleyici ve dışa aktarma bu belgeye göre test edilir.
3. **Düzenleyici: TipTap (ProseMirror, MIT).** Deneme sayfasındaki `execCommand` yöntemi tarayıcının eskimiş ve tutarsız yoludur, gerçek uygulamaya konmaz. TipTap ile tablo, yapılacak listesi, bağlantı, geri al/yinele, yazarken kendiliğinden biçim ve yapıştırma kuralları hazır gelir. Markdown'a çevirme `prosemirror-markdown` ile ve kendi eklerimiz için yazılan kurallarla yapılır. Lisans GPL-3.0 ile uyumlu; `THIRD_PARTY_NOTICES.md`'ye eklenir.
4. **Ortak kod tek yerde.** Masaüstü zaten `../../../design/` altından içe aktarıyor. Yeni `shared/notes/` klasörü: düzenleyici, Markdown çizici (bugünkü `desktop/src/markdown.ts` buraya taşınır), biçim belgesi testleri. Masaüstü (Vite) ve eklenti (esbuild) aynı dosyaları paketler.
5. **Açılan not, değiştirilmedikçe yeniden yazılmaz.** Eski düz metin notlar düzenleyicide açılıp hiçbir şey değiştirilmeden kapatılırsa veritabanına dokunulmaz (Markdown'a gidiş-dönüşte boşluk/işaret farkı oluşabilir).
6. **Veritabanı değişikliklerinin kuralı.** `notes` eklentinin migrasyonlarına aittir, ona sütun eklenmez. Yeni şeyler `note_meta` gibi, iki tarafta da birebir aynı `IF NOT EXISTS` ifadeleriyle oluşan tablolara gider. `ALTER TABLE … ADD COLUMN` gerekiyorsa iki taraf da önce `PRAGMA table_info` ile sütunu denetler. Eşitlik `tests/note-meta.test.ts` örneğindeki gibi testle korunur. Her yeni tablo `src/core/backup.ts` `columns` ve `introduced` listesine ve masaüstü yedeğine eklenir.
7. **Not uzunluk sınırı.** Bugün eklenti 5 000 (yakalama), masaüstü 10 000 karakter. Biçim işaretleri metni uzatır: sınır iki tarafta da 50 000'e çıkar; görseller metne gömülmez (madde 35).
8. **İki ekran aynı anda.** Otomatik kaydetme (45) ile masaüstü ve panel aynı notu aynı anda düzenleyebilir. Kayıt `updated_at` beklenen değerle eşleşmezse üzerine yazılmaz; "Bu not başka yerde değişti: yeniden yükle / benimkini kaydet" sorulur. Kaybolan metin düzenleme geçmişinde (7) durur.

## 3. Sürümler

Her sürümde: `release-notes/vX.Y.Z.md` ve `whats-new.ts` `CHANGELOG` girişi, Türkçe karakter taraması, `npx vitest run` + `cargo test`, eklenti sayfalarında önizleme yöntemiyle (DURUM §0) ve gerçek Chrome'da elle deneme. `dist`'e yalnız testleri geçmiş derleme yazılır (kullanıcının günlük eklentisi oradan yükleniyor).

### 0.8.2 — Boşluk düzeltmesi (yama)
- Panel: `.memo-text` için `white-space: pre-wrap` (`src/panel/panel.css`); iki satırla kesme kalır ama satır sonları görünür.
- Masaüstü çizici (`desktop/src/markdown.ts`): boş satırlar korunur. Ardışık boş satır sayısı kadar boşluk bırakılır (üst sınır 3); paragraf arası 4px'ten satır yüksekliğine çıkar.
- Test: boş satırlı metnin çizimi (paragraf sayısı ve boşluk öğeleri).
- **Bitti sayılır:** kullanıcının boşluklu yazdığı bir not iki ekranda da yazdığı gibi görünüyor.

### Ön çalışma (sürüm çıkmaz) — düzenleyici denemesi
Kalan her şey düzenleyicinin üstüne kurulduğu için önce risk ölçülür:
- TipTap + Markdown dönüşümü `shared/notes/` altında; masaüstü ve eklenti panelinde çalışan en küçük hâl.
- Gidiş-dönüş testleri: `docs/not-bicimi.md`'deki her örnek Markdown → düzenleyici → Markdown aynı çıkmalı. Kullanıcının mevcut notlarından (yedekten) bir örnek kümeyle de denenir: açıp kapatınca değişmemeli.
- Paket büyüklüğü ölçülür (beklenen 150–200 KB). Panel açılış süresi ölçülür; gerekirse düzenleyici yalnız düzenlemeye geçince yüklenir.
- **Karar noktası:** gidiş-dönüş kayıpsız ve boyut kabul edilebilirse 0.9.0'a geçilir; değilse kullanıcıya seçenekler sunulur.

### 0.9.0 — Yeni düzenleyici
- **9:** Üst çubuk: paragraf biçimi (Normal, Başlık 1, Başlık 2, Alıntı), K, E, A (altı çizili), Ü (üstü çizili), vurgu, kod, yazı rengi, biçimi temizle, madde/numaralı liste, yapılacak, bağlantı, tablo, ayırıcı. Seçimin üstünde küçük çubuk: K, E, A, Ü, vurgu, bağlantı, renk. Çubuk düğmeleri seçimin durumunu gösterir (kalın seçiliyse K basılı). Ctrl+B/I/U/K.
- **10 + 47:** tablo ekleme; hücrede sağ tık: üste/alta satır, sola/sağa sütun, satırı/sütunu sil, tabloyu sil. Tab ile sonraki hücre.
- **30:** web'den yapıştırmada kalın, eğik, başlık, liste, bağlantı, tablo kalır; yazı tipi, boyut, arka plan, renk, sınıflar atılır. Ctrl+Shift+V düz metin. Word ve Google Docs'tan yapıştırma ayrıca denenir.
- **31:** `# `, `## `, `- `, `1. `, `[] `, `> `, `---`, `**…**`, `*…*`, `` `…` ``, `==…==`, `~~…~~`.
- **33:** biçim boyacısı: bir kez tıkla = bir kez uygula, çift tıkla = Esc'e kadar uygula.
- **34:** Ctrl+F not içinde bul (eşleşmeler vurgulu, ileri/geri), Ctrl+H değiştir / tümünü değiştir; Türkçe büyük/küçük harf duyarsız (`tr-TR`).
- **45:** yazmayı bırakınca 1,5 sn sonra kayıt; köşede "Kaydediliyor… / Kaydedildi / Kaydedilemedi, tekrar dene". Esc ve dışarı tıklama düzenlemeyi kapatır. Masaüstü ve panelde aynı. Kayıt çakışması için §2 madde 8.
- **2:** yeni not kutusundaki metin `localStorage`'da taslak olarak tutulur (masaüstü ve panel ayrı); not eklenince silinir.
- **8:** düzenleyicinin altında kelime ve karakter sayısı; odak modu düğmesi (masaüstünde pencereyi dolduran, kenar çubuğu gizli yazma ekranı; Esc ile çıkış).
- **1:** eklenti panelinde not gövdesi ortak çizicide biçimli görünür; uzun notlar "Devamını göster" ile açılır; yapılacak kutucukları tıklanabilir.
- **41:** satır menüsünde "Çoğalt": metin, kategori, bağlantı ve renk kopyalanır; görsel ve sayfa kopyası kopyalanmaz; başlığa " (kopya)" eklenir.
- Hızlı not penceresi (`Ctrl+Alt+N`) aynı düzenleyiciyi kullanır.
- Not sınırı 50 000 karakter (§2 madde 7).
- **Bitti sayılır:** deneme sayfasındaki her işlem iki ekranda ve hızlı not penceresinde çalışıyor; eski notlar açılıp kapanınca değişmiyor; gidiş-dönüş testleri geçiyor.

### 0.10.0 — Çöp kutusu, kategoriler, renk, geçmiş, elle sıralama
Bu sürüm veritabanı değiştirir; hepsi tek eklenti migrasyonunda (13) ve masaüstünde aynı ifadelerle.
- **Şema (öneri, ön çalışmada kesinleşir):**
  - `note_meta`'ya `deleted_at`, `color`, `position` sütunları (iki taraf `PRAGMA table_info` ile denetleyip ekler).
  - `note_categories (id TEXT PRIMARY KEY, label TEXT NOT NULL, color TEXT, position INTEGER NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`; ilk açılışta bugünkü dört kategori (`note`, `read`, `watch`, `idea`) `builtin` olarak eklenir.
  - `note_history (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, text TEXT NOT NULL, saved_at INTEGER NOT NULL)`.
- **B, çöp kutusu:** "Sil" notu çöpe taşır (`deleted_at`). Silinen not listede, aramada, sayılarda, etiketlerde görünmez; hatırlatması çalmaz. "Çöp kutusu" sekmesi: her notta "X gün sonra kalıcı olarak silinecek", Geri yükle, Kalıcı sil, Çöpü boşalt (sayfa içinde onay). 15 günü geçenler masaüstü açılışında ve eklenti arka planında günde bir kez kalıcı silinir (görsel, sayfa kopyası, geçmiş dahil). Bugünkü 6 sn "Geri al" çubuğu kalır.
- **14, kategoriler:** Ayarlarda ve kategori sekmelerinin yanındaki menüde: ekle, yeniden adlandır, renk seç, sırala, sil. "Notlar" silinemez. Silinen kategorinin notları Notlar'a taşınır; önce "12 not Notlar'a taşınacak" onayı. Eklentideki sabit listeler (`src/modules/slapmemo/categories.ts`, masaüstü `NOTE_CATEGORIES` ve `CATEGORIES`) kaldırılır; sağ tık menüsü, baloncuk, Komut Merkezi kategorileri veritabanından alır.
- **6, renkli not:** satır menüsünde renk seçici (sarı, yeşil, mavi, pembe, mor, renksiz). Listede sol kenar şeridi, kartta arka plan (deneme sayfasındaki gibi); iki temada da okunur.
- **7, geçmiş:** her kaydedişte önceki metin `note_history`'ye yazılır; aynı nota 5 dakikadan sık gelen kayıtlar birleşir; not başına en fazla 30 kayıt, 60 günden eskiler silinir. Satır menüsünde "Geçmiş…": tarih listesi, seçilen hâlin önizlemesi, "Bu hâle dön" (dönmeden önceki hâl de geçmişe yazılır).
- **18, elle sıralama:** sıralama seçeneklerine "Elle"; seçiliyken satırlar sürüklenir, `position` güncellenir. Sabitlenenler yine üstte.
- Yedek: yeni tablolar ve sütunlar dışa/içe aktarmaya; eski yedek geri yüklenince dört kategori yerine gelir.
- **Bitti sayılır:** eski veritabanı migrasyondan sonra aynı notları gösteriyor; eklenti önce ya da masaüstü önce açılsa da şema aynı; çöpteki not 15 gün sonra gidiyor (zaman taşınarak test edilir); silinen kategori notları kaybetmiyor.

### 0.11.0 — Düzen ve bulma
- **15:** liste / kart geçişi, seçim hatırlanır. Kartlar sütunlu yerleşim, uzun not kartta kısaltılır.
- **17:** hızlı süzgeç hapları: Hatırlatmalı, Yapılacak içeren, Bitmemiş işler, Görselli, Bağlantılı, Bu hafta. Her hapta sayı; birden çoğu birlikte seçilir (hepsine uyan notlar). Kategori ve aramayla birlikte çalışır.
- **16:** "Etiketler" penceresi: tüm etiketler ve kaç notta geçtikleri; yeniden adlandır (tüm notlarda değişir, geçmişe yazılır), sil (etiketi metinden kaldırır), birleştir (yeniden adlandırma var olan bir etikete yapılınca).
- **39:** aramada eşleşen kelimeler notlarda vurgulu; arama açıkken bir not açılınca ilk eşleşmeye kaydırılır.
- **4:** satırda seçim kutusu (Shift ile aralık, Ctrl+A tümü); alt çubukta: Çöpe taşı, Arşivle, Kategori, Renk, Dışa aktar (0.12.0'dan sonra).
- **19:** `[[` yazınca not arama listesi açılır; seçilince `[[Başlık]](lt-note:42)` girer. Başlık, notun ilk satırıdır (ayrı başlık alanı açılmaz). Tıklayınca o not açılır; hedef silinmişse "Not çöpte / bulunamadı". Notun altında "Bu nottan bahsedenler" listesi. Hedef notun başlığı değişince bağlantı yazısı görünüşte güncellenir (kimlik değişmediği için kopmaz).
- **37:** başlığın yanında ok; altındaki bölüm (sonraki aynı ya da üst düzey başlığa kadar) kapanır. Kapalı/açık durumu not başına hatırlanır (`localStorage`, veritabanına yazılmaz).
- **Bitti sayılır:** deneme sayfasındaki liste/kart ve süzgeç davranışı iki ekranda da var; yeniden adlandırılan etiket her notta değişiyor ve geri alınabiliyor.

### 0.12.0 — Görseller, aktarım, şablonlar
- **3 + 35:** yeni `note_media (id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE, data_url TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL)`. Ctrl+V ya da sürükle-bırak ile görsel imlecin olduğu yere girer, metinde `![](lt-img:7)`. Köşeden boyut (genişlik `![](lt-img:7 =320)` gibi saklanır). Görsel en fazla 1280 px'e küçültülüp JPEG/WebP'ye çevrilir (bugünkü ekran görüntüsü kodu gibi, 500 KB üst sınırı). Metinden silinen görsel, geçmişte de geçmiyorsa temizlenir. Bugünkü `note_images` (not başına tek görsel) okunmaya devam eder; yeni kayıtlar `note_media`'ya.
- **5:** tek not, seçili notlar (4), kategori ya da tümü `.md` (görseller ayrı klasörde, ZIP) veya `.txt` olarak. LifeTools ekleri (§2 madde 2) dışarıda okunur hâle çevrilir: renk ve altı çizgi düz metin olur, not bağlantıları başlık olur.
- **28:** `.md` / `.txt` dosyaları (çoklu seçim; ilk satır başlık), Google Keep Takeout (JSON + HTML; başlık, metin, yapılacak listeleri, etiketler, renk, arşiv, sabit). İçe aktarma önizlemesi: "34 not, 2 görsel, 5 etiket gelecek" → onay. Hepsi tek işlemde (DURUM: çok adımlı DB işi arka planda, kilit altında).
- **12:** "Yeni not" düğmesinin yanında şablon menüsü: hazırlar (Toplantı, Alışveriş listesi, Günlük, Okuma notu) ve "Bu notu şablon olarak kaydet". Şablonlar `note_templates (id, name, text, position, created_at)` tablosunda; adı değiştirilebilir, silinebilir. Şablondaki `{tarih}` açılırken bugünün tarihine çevrilir.
- **Bitti sayılır:** dışa aktarılan bir kategori içe aktarılınca aynı notlar (görsellerle) geri geliyor; Keep örneği doğru aktarılıyor.

### 0.13.0 — Tarayıcıdan not alma ve ayrı pencere
- **49:** baloncukta ve sağ tık menüsünde "Şu nota ekle…": son kullanılan 5 not ve arama. Metin notun sonuna, kaynağın bağlantısıyla eklenir. Hızlı yol: "Son nota ekle".
- **50:** seçilen metin sayfadan HTML olarak alınır, 0.9.0'daki yapıştırma temizleme kurallarıyla Markdown'a çevrilip kaydedilir. Ayarlarda kapatılabilir (düz metin).
- **51:** düzenleyiciye bir adres yapıştırılınca: eklentide açık sekmeler arasında o adres varsa başlığı alınır; yoksa masaüstü arka ucu sayfanın `<title>`'ını 3 sn zaman aşımıyla okur (yalnız `http/https`, ilk 64 KB). Alınamazsa adres olduğu gibi kalır. Ctrl+Shift+V her zaman çıplak adres.
- **52:** masaüstünde satır menüsünde "Ayrı pencerede aç": not kendi Tauri penceresinde, aynı düzenleyiciyle; boyut ve konum hatırlanır; ana penceredeki liste değişikliği görür. Üstte tutma yok.
- **Bitti sayılır:** üç farklı siteden "Şu nota ekle" ile toplanan parçalar tek notta, biçimleri ve kaynak bağlantılarıyla duruyor.

### İleride — 29 parolalı not
Not metni parolayla şifrelenir (Web Crypto, AES-GCM, PBKDF2). Parola unutulursa kurtarılamaz; aramada, hatırlatmada, dışa aktarmada görünmez. Ayrı bir plan gerektirir.

## 4. Riskler

| Risk | Önlem |
|---|---|
| Düzenleyici eski notları değiştirir (boşluk, işaret) | §2 madde 5; ön çalışmadaki gidiş-dönüş testleri; gerçek not örneğiyle deneme |
| Paket büyür, panel geç açılır | ön çalışmada ölçüm; düzenleyici yalnız düzenlemede yüklenir |
| Eklenti ve masaüstü şeması ayrışır | aynı DDL listesi + eşitlik testi; iki açılış sırasıyla da test |
| Kayıt çakışması (iki ekran, otomatik kayıt) | `updated_at` denetimi + geçmiş |
| Görseller veritabanını şişirir | küçültme, 500 KB sınırı, kullanılmayan görsel temizliği |
| Yapay zekâ ile yazılan kodda Türkçe harf bozulması | commit öncesi tarama (DURUM kuralı) |
| Kullanıcının günlük eklentisi `dist`'ten yükleniyor | `dist`'e yalnız testleri geçmiş derleme |

## 5. Açık sorular (ilgili sürümden önce kullanıcıya sorulacak)
- 0.9.0: yazı rengi paleti bu altı renk mi?
- 0.10.0: çöp kutusu süresi ayarlanabilir olsun mu (yalnız 15 gün mü)?
- 0.11.0: kart görünümü masaüstünde varsayılan mı olsun, panelde de olsun mu (panel dar)?
- 0.12.0: Keep dışında içe aktarılacak başka uygulama var mı (Notion, Evernote, OneNote)?
