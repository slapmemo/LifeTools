# LifeTools — Bug Fixleme Listesi

> Oluşturma: 18 Kasım 2026. Kaynak: kodun elle incelenmesi (testlere bakılmadan).
> Her madde: **Sorun**, **Nerede**, **Ne olur**, **Önerilen düzeltme**. Önem: 🔴 yüksek · 🟠 orta · 🟢 düşük.
> Bitince maddenin başındaki kutuyu işaretle.

## 0. Bu oturumda düzeltilenler (commit edilmedi)

- [x] 🔴 **Instagram hız döngüsü (ratechange ping-pong).** `src/modules/instagram/ig-ui.ts`, `speed.ts` (`createRateGuard`). Sayfa hızı geri çekerse 1 sn içinde en fazla 3 kez düzeltilir.
- [x] 🟠 **Instagram/X medya listeleri sınırsız büyüyordu.** `src/core/bounded-map.ts` (`capMap`); Instagram 500 gönderi / 1000 dosya adı, X 500 tweet.
- [x] 🟠 **Site engelleyici panelden eklenen kişiyi açık sekmede engellemiyordu.** `src/modules/site-blocker/background.ts` artık `blockedHandles` değişimini de dinliyor.
- Test: `tests/media-loop-guards.test.ts`. 316/316 test geçti. Instagram'da canlı denenmedi.

---

## 1. Yüksek öncelik

- [x] 🔴 **Panel tek bir bölüm hatasında yarım kalıyor**
  - Nerede: `src/panel/panel.ts:63-86` (`refresh`)
  - Ne olur: Bölümler sırayla `await` ediliyor; hiçbiri hatayı yakalamıyor. Depolama "Masaüstü" iken masaüstü uygulaması kapalıysa `watch.render()` (ve `tabTools.render()`) hata verir; sonraki bölümler (Pano yuvaları, Süre takibi, Şablonlar, Engelleyici, Notlar, Link temizleyici, Zombiler, Kısayollar, Araç çubuğu) hiç çizilmez.
  - Düzeltme: Her bölüm çağrısını kendi `try/catch`'ine al (ör. `const safe = (fn) => fn().catch(err => console.debug(...))`), hata olsa da diğerleri çizilsin.

- [x] 🔴 **Paneldeki "etkin sekme" hep panelin kendisi**
  - Nerede: `src/modules/tab-notes/panel.ts:243` (`render`), `src/modules/link-cleaner/panel.ts:263`, `src/panel/sections/pip.ts:94`
  - Ne olur: Panel ayrı bir sekmede açık; `chrome.tabs.query({ active: true, currentWindow: true })` panel sekmesini döndürür. Sekme notu/etiketi panelin adresine kaydedilir; Link temizleyici "Bu sayfanın linki kullanılamıyor" der; PiP düğmesi "Görünür video bulunamadı" der.
  - Düzeltme: Hedef sekmeyi panel dışından seç: aynı penceredeki son etkin *uzantı dışı* sekme (`chrome.tabs.query({ windowId })` + `lastAccessed` sıralaması, `isInternalTabUrl` olanları at). Bulunamazsa bölümü "Bir sekme seç" durumuna al.

- [x] 🔴 **Sekme notu, aynı adres başka sekmede açıkken taşınıp siliniyor**
  - Nerede: `src/modules/tab-notes/background.ts:39` (`onRemoved`)
  - Ne olur: Aynı sayfa iki sekmede açıkken birini kapatınca not SlapMemo'ya aktarılır ve sekme notundan silinir; açık kalan sekmede not kaybolur.
  - Düzeltme: Aktarmadan önce `chrome.tabs.query({})` ile aynı `normalizeUrl` değerine sahip başka açık sekme var mı bak; varsa aktarma. (İsteğe bağlı: `isWindowClosing` ve tarayıcı kapanışında aktarma yapılıp yapılmayacağı da kararlaştırılmalı.)

- [x] 🔴 **SlapMemo her sayfa yüklemesinde tüm notları çekiyor**
  - Nerede: `src/modules/slapmemo/repo.ts:82` (`notesForUrl`), çağıran `slapmemo/background.ts:137`
  - Ne olur: `SELECT * FROM notes WHERE url IS NOT NULL` tüm notları (metin, sayfa başlığı) her `status=complete` olayında okur. Not sayısı arttıkça yavaşlar; masaüstü depolamasında yanıt 1 MB'ı geçince sorgu hata verir ve "bu sayfada notun var" ipucu hiç çıkmaz.
  - Düzeltme: Normalleştirilmiş adresle SQL'de filtrele. En basit: `WHERE url = ? OR url = ? OR url LIKE ?` (sondaki `/` ve `#` varyasyonları) + `LIMIT 5`, yalnız `id, text, created_at` sütunları. Kalıcı çözüm: `notes`'a dokunmadan ayrı bir `note_url_index` tablosu ya da `url` için ifade dizini.

- [x] 🔴 **X GIF dönüştürme dikey videoda ~300 MB bellek kullanıyor**
  - Nerede: `src/modules/x-video/gif-encoder.ts:3` (`frameSize`), `gif-offscreen.ts:24-30`
  - Ne olur: Yalnız genişlik 480'e sınırlanıyor. 720×1280 video → 480×853 × 180 kare ≈ 295 MB `Uint8ClampedArray`. Bilgisayarı yavaşlatabilir, offscreen belgesi çökebilir.
  - Düzeltme: Hem genişlik hem yükseklik için üst sınır (ör. `scale = Math.min(1, 480 / width, 480 / height)`) ve/veya toplam piksel bütçesi (kare sayısı × alan). Kareleri biriktirmek yerine akış halinde kodlamak daha iyi.

## 2. Orta öncelik

- [x] 🟠 **Bir modülden site kaldırınca diğer modülün izni de gidiyor**
  - Nerede: `src/modules/site-toolbar/panel.ts:101`, `src/modules/smart-replies/panel.ts:223`
  - Ne olur: İki modül aynı `https://site/*` iznini kullanıyor. Birinden siteyi kaldırınca `chrome.permissions.remove` izni tamamen geri alır; diğer modül o sitede sessizce çalışmaz.
  - Düzeltme: İzni kaldırmadan önce diğer modülün listesinde (`SITES_KEY` / `TOOLBAR_SITES_KEY`) aynı köken var mı bak; varsa kaldırma. Ortak bir `releaseOrigin(origin)` yardımcısı yaz.

- [x] 🟠 **Sekme Yöneticisi her sekme değişiminde baştan çiziliyor (arka planda bile)**
  - Nerede: `src/modules/tab-manager/tabs.ts:641-643` (`schedule`)
  - Ne olur: Herhangi bir sekmenin başlık/ikon/ses değişimi tüm listeyi yeniden kurar; sayfa gizliyken de çalışır ve her pencerede sabit bir Yönetici sekmesi olduğundan iş pencere sayısı kadar tekrarlanır. Açık grup adı düzenlenirken liste yenilenirse yazılan ad kaybolur.
  - Düzeltme: `document.hidden` iken yalnızca "kirli" işaretle, `visibilitychange` ile görünür olunca yükle. `onUpdated`'da yalnız `url/title/favIconUrl/pinned/groupId/audible` değişimlerini dinle. Bir `input` odaktayken render'ı ertele.

- [x] 🟠 **Sağ tık menüsü her sekme değişiminde silinip baştan kuruluyor**
  - Nerede: `src/modules/tab-manager/background.ts:131-137` → `core/context-menu.ts` `performRebuild`
  - Ne olur: Her sekme geçişinde `removeAll` + tüm öğeler yeniden oluşturulur; şablonlar, yuvalar, kayıtlı gruplar DB'den yeniden okunur. Geçişten hemen sonra sağ tıklanırsa LifeTools menüsü eksik/boş olabilir.
  - Düzeltme: Sekmeye bağlı kısmı (`tab-manager:menu`) `chrome.contextMenus.update` ile güncelle ya da `onShown` kullanılamadığı için yalnız grup/oturum listesi değişince yeniden kur; sekme etkinleşmesinde yalnız "✓" işaretlerini `update` et.

- [x] 🟠 **SlapMemo panelinde yalnız son 50 not görünüyor**
  - Nerede: `src/modules/slapmemo/panel.ts:20` (`LIST_LIMIT`), `render`
  - Ne olur: "Daha fazla" yok; eski notlara panelden yalnızca aramayla ulaşılır.
  - Düzeltme: "Daha fazla yükle" düğmesi (`offset += 50`) ya da sonsuz kaydırma.

- [x] 🟠 **Yedekte bazı ayarlar yok**
  - Nerede: `src/core/backup-settings.ts:12`
  - Ne olur: Günlük süre limitleri (`timeTrackerLimits`, `timeTrackerLimitsEnabled`), döviz (`currency.settings`), PiP (`pip_hover_enabled`), SlapMemo baloncuk/ipucu, Link temizleyici, Instagram hızı, izleme düğmesi, YouTube düğmesi vb. geri yüklemede varsayılana döner.
  - Düzeltme: Anahtar listesini genişlet; hangi anahtarın yedeklendiğini tek bir listede (ör. her modül `settingsKeys` dışa aktarsın) topla.

- [x] 🟠 **Uzun yedek işleminde masaüstü pano kaydı kaybolabiliyor**
  - Nerede: `src/db/host.ts:143` (`exportBackground` BEGIN … COMMIT, 120 sn'ye kadar) ↔ `desktop/src-tauri/src/db/clipboard.rs` `insert_clip` (busy_timeout 5 sn)
  - Ne olur: Eklenti masaüstü DB'sinde uzun bir işlem açık tutarken kopyalanan metin 5 sn bekleyip yazılamaz.
  - Düzeltme: Dışa aktarmayı `BEGIN` yerine salt okunur anlık görüntüyle yap (WAL'da okuma işlemi yazanı engellemez; `BEGIN` → `BEGIN DEFERRED` + yalnız `SELECT` zaten okuyucu kilidi alır — kontrol et). Masaüstü tarafında `insert_clip` başarısız olursa kısa bir yeniden deneme kuyruğu ekle.

## 3. Düşük öncelik

- [x] 🟢 **Şablon yapıştırma eski panoyu korumasız geri koyuyor**
  - Nerede: `desktop/src-tauri/src/paste.rs:93`
  - Ne olur: Önceki pano metni `exclude_from_history` olmadan geri yazılır; parola yöneticisinden kopyalanmış parola Windows pano geçmişine düşebilir. Önceki içerik resimse hiç geri gelmez.
  - Düzeltme: Geri yazarken `.exclude_from_history().exclude_from_cloud()` kullan; metin değilse geri yazmayı atla (ya da resmi de sakla).

- [x] 🟢 **Video indirme takibi 30 sn'de bir**
  - Nerede: `src/modules/video-downloader/background.ts:48,67,76` (`delayInMinutes: 0.025`)
  - Ne olur: Chrome alarmları en az 30 sn; "İndirildi" bildirimi 30 sn gecikebilir.
  - Düzeltme: Kabul et ve yorumu düzelt ya da offscreen/sayfa açıkken `setTimeout` ile sık yokla.

- [x] 🟢 **X indir düğmesi hızlı çift tıklamada ✓ olarak takılı kalıyor**
  - Nerede: `src/modules/x-video/x-video-ui.ts:70` (`showSuccess`)
  - Ne olur: İkinci çağrı ✓ ikonunu "eski" olarak saklar ve geri yükler.
  - Düzeltme: Orijinal SVG'yi düğme oluşturulurken bir kez sakla (`dataset` / WeakMap), `showSuccess` onu geri koysun.

- [x] 🟢 **Masaüstü şablon zaman damgaları saniye, eklentininki milisaniye**
  - Nerede: `desktop/src-tauri/src/db/snippets.rs:44` (`now_secs`) ↔ `src/modules/smart-replies/repo.ts` (`Date.now()`)
  - Ne olur: Aynı tabloda karışık birim; tarih gösterimi/sıralama yanlış olabilir.
  - Düzeltme: Masaüstünde `now_millis()` kullan; eski satırları (değer < 1e12) bir kerelik ×1000 ile düzelt.

- [x] 🟢 **Bazı masaüstü komutları arayüzü kilitliyor**
  - Nerede: `desktop/src-tauri/src/commands.rs` (`video_tools_status` ilk çağrıda `yt-dlp --version` çalıştırır, `backup_export`, `video_jobs`)
  - Ne olur: Tauri 2'de senkron komutlar ana iş parçacığında çalışır; bekleme süresince pencere donar.
  - Düzeltme: Bu komutları `async` + `spawn_blocking` yap (`dashboard_summary` gibi).

- [x] 🟢 **Modül aç/kapatınca panel iki kez yenileniyor**
  - Nerede: `src/panel/sections/modules-toggle.ts:52` + `src/panel/panel.ts:89`
  - Düzeltme: Toggle'daki `refresh()` çağrısını kaldır; `storage.onChanged` zaten yeniliyor.

- [x] 🟢 **Zombi "Tümünü kapat/taşı" eski listeyi kullanıyor**
  - Nerede: `src/modules/zombie-tabs/panel.ts:206-211`
  - Ne olur: Liste çizildikten sonra bu sekmelerden birine geçildiyse o da kapanır.
  - Düzeltme: İşlemden hemen önce `selectZombies` ile listeyi tazele.

- [x] 🟢 **Döviz "tüm siteler" yalnız https**
  - Nerede: `src/modules/currency/settings.ts` (`ALL_SITES_ORIGIN = 'https://*/*'`)
  - Düzeltme: `http://*/*` de ekle ya da bilinçli karar olarak not düş.

- [x] 🟢 **Offscreen DB dinleyicisi göndereni denetlemiyor**
  - Nerede: `src/db/offscreen.ts:23`
  - Ne olur: Service worker köprüsü yalnız eklenti sayfalarını kabul ediyor ama offscreen her `runtime` mesajını doğrudan çalıştırıyor. Bugün sömürülemez; savunma katmanı eksik.
  - Düzeltme: `sender.url === chrome.runtime.getURL('background.js')` ya da `!sender.tab && sender.id === chrome.runtime.id` denetimi.

- [x] 🟢 **`replaceSiteScript` güncellemede `world` değerini sıfırlamıyor**
  - Nerede: `src/core/site-scripts.ts:43`
  - Düzeltme: `world` verilmediyse `updateContentScripts`'e `world: 'ISOLATED'` gönder.

- [x] 🟢 **Video araç kurulum kilidi kenar durumu**
  - Nerede: `desktop/src-tauri/src/video_dl.rs:78` (`begin_install`)
  - Ne olur: Kilit önce ana işlemin PID'iyle yazılıyor; yardımcı işlem kendi PID'ini yazmadan çökerse ana işlem yaşadıkça "kuruluyor" takılı kalır ve yeniden kurulum başlatılamaz.
  - Düzeltme: Kilide çocuk işlemin PID'ini yaz (spawn sonrası) ya da kilide zaman damgası ekleyip 10 dk sonra geçersiz say.

## 4. Bilgi / tasarım notları

- Süre takibi video izlerken 60 sn klavye/fare hareketi yoksa "boşta" sayar (`chrome.idle`). İstenirse sesli sekmede boşta sayma.
- Masaüstü not listesi 500, eklenti panel listesi 50 not ile sınırlı.

---

## 5. İkinci okuma bulguları

Okunanlar: `x-video-ui.ts` (tamamı), `x-video/extract.ts`, `shared.ts`, `menu-position.ts`, `gif-encoder.ts`, `youtube.ts` (tamamı), `bubble-content.ts` (tamamı), `smart-replies/panel.ts`, `watchlist/panel.ts`, `command-search.ts`, `ui-visibility.ts`, `whats-new.ts`, `desktop-features.ts`, `panel/ui.ts`, `navigation.ts`, `subtabs.ts`, `onboarding/welcome.ts` + `catalog.ts`; masaüstü arayüzde `markdown.ts`, `picker.ts`, `quicknote.ts`, `dom.ts`, `view-components.ts`, `feature-state.ts`, `pano.ts`, `sablonlar.ts`, `ayarlar.ts`, `anasayfa.ts`, `piller.ts`, `ortam.ts`, `ambient.ts`, `notlar.ts` (kalan kısım); Rust'ta `battery.rs`, `battery_win.rs`, `win.rs`, `features.rs`, `ambient.rs`, `db/watch.rs`; `tauri.conf.json`, `capabilities/default.json`, `windows/hooks.nsh`, `build.mjs`, `.github/workflows/release.yml`, `scripts/zip_extension.py`, HTML dosyaları.

- [x] 🔴 **GIF kodlayıcı sıkıştırma yapmıyor ve çıktıyı JS dizisinde biriktiriyor** (Bölüm 1'deki GIF maddesiyle birlikte çöz)
  - Nerede: `src/modules/x-video/gif-encoder.ts:49-73` (`encodeGif`)
  - Ne olur: Her piksel için ayrı 9 bitlik kod yazılıyor (LZW sözlüğü kullanılmıyor, 200 kodda bir sıfırlanıyor), yani GIF ham veriden bile büyük (~1,1 bayt/piksel). Çıktı `number[]` içinde toplanıyor; JS'de her eleman ~8 bayt. 480×270×180 karede ~23 MB GIF → ~190 MB dizi; dikey videoda (480×853) ~83 MB GIF → ~660 MB dizi. Kare tamponlarıyla (~300 MB) birlikte offscreen belgesi 1 GB'ı geçebilir; indirilen GIF de çok büyük.
  - Düzeltme: Çıktıyı önceden boyutlanmış/büyüyen `Uint8Array` parçalarına yaz; gerçek LZW (sözlüklü) uygula ya da hazır, küçük bir kodlayıcı (ör. `gifenc`) kullan; kareleri biriktirmeden akış halinde kodla; çözünürlük ve kare sayısı için toplam piksel bütçesi koy.

- [x] 🟠 **Derleme önce `dist`'i siliyor; yarıda kalan derleme günlük eklentiyi bozuyor**
  - Nerede: `build.mjs:7` (`rmSync(dist)`)
  - Ne olur: Chrome eklentiyi doğrudan `LifeTools/dist`'ten yüklüyor. Derleme ortada hata verirse (esbuild hatası, `sqlite3.wasm` bulunamadı vb.) `dist` boş/yarım kalır; Chrome yeniden yüklediğinde eklenti çalışmaz.
  - Düzeltme: `dist.tmp`'ye derle, başarılı bitince `dist`'i eskisiyle yer değiştir (rename). Ayrıca `npm run build` öncesi `npm test` + `tsc` zorunlu olabilir.

- [x] 🟠 **X indir düğmesi indirme başarısız olsa da ✓ gösteriyor**
  - Nerede: `src/modules/x-video/x-video-ui.ts` `makeButton` → `button` tıklaması (`askQuality` kapalıyken)
  - Ne olur: `void download(...)` beklenmeden `showSuccess(button)` çağrılıyor; indirme reddedilse de kullanıcı ✓ görür.
  - Düzeltme: `download()` sonucunu bekle; başarısızsa `title = 'İndirilemedi'` ve menüyü aç (GIF akışındaki gibi).

- [x] 🟠 **Masaüstünde değiştirilen şablonlar eklentiye yansımıyor**
  - Nerede: `desktop/src/views/sablonlar.ts` (kaydet/sil) ↔ `src/modules/smart-replies/content.ts:6`, `smart-replies/background.ts:137`
  - Ne olur: Eklenti şablon listesini yalnızca `smartReplyChanged` anahtarı değişince tazeliyor; masaüstünden eklenen/silinen şablon, sayfa yenilenene ya da eklenti yeniden başlayana kadar yazarken genişletmede ve sağ tık menüsünde eski kalır. Ayrıca masaüstü başlığı 80 karakterle sınırlıyor, eklenti sınırlamıyor; eklentide uzun başlıkla kaydedilen şablon masaüstünde düzenlenemez.
  - Düzeltme: İçerik betiği listeyi her odaklanmada (ya da 1–2 dk'da bir) yeniden istesin; arka plan `list` cevabını kısa süre önbelleklesin. Başlık sınırını iki tarafta eşitle (eklentide de 80).

- [x] 🟢 **Açılır penceredeki "yuva" komutu hiçbir şey bulmuyor**
  - Nerede: `src/core/command-search.ts:33` (`yuva: 'slots.show'`)
  - Ne olur: `slots.show` diye bir eylem kayıtlı değil (yuvalar `clip.copyA`…`clip.copyE`). "yuva" yazınca sonuç listesi boş kalır.
  - Düzeltme: Komutu kaldır ya da `clip.copyA`… eylemlerini listeleyen bir sonuç döndür / Panel › Metin › Pano yuvaları'nı açan bir eylem ekle.

- [x] 🟢 **Kullanılmayan kod: `parseTurkishDue`**
  - Nerede: `src/core/command-search.ts:38-72`
  - Ne olur: Görevler modülü 0.5.8'de kaldırıldı; fonksiyon artık hiçbir yerden çağrılmıyor (yalnız testlerde olabilir).
  - Düzeltme: Fonksiyonu ve testini kaldır.

- [x] 🟢 **Onaylı menü öğesi onaydan sonra "silahlı" kalıyor**
  - Nerede: `src/panel/ui.ts` `createKebabMenu` (ikinci tıklamada `dataset.armed` ve etiket sıfırlanmıyor); masaüstü `desktop/src/view-components.ts` `rowMenu` (etiket "Emin misin?" olarak kalıyor, `run` hatası yakalanmıyor)
  - Ne olur: İşlem hata verir ya da satır yeniden çizilmezse menü tekrar açıldığında tek tıklamayla silme yapılır; masaüstünde düğme "Emin misin?" yazısıyla kalır ve silme hatası sessizce yutulur.
  - Düzeltme: `onSelect` çağrısından önce `armed='false'`, etiketi geri yükle; masaüstünde `run`'ı `try/catch` ile sar ve hatayı göster.

- [x] 🟢 **Yayın iş akışı tip denetimi yapmıyor**
  - Nerede: `.github/workflows/release.yml` ("Build and test extension": `npm test` + `npm run build`)
  - Ne olur: esbuild ve vitest tip denetimi yapmaz; tip hatası olan kod yayınlanabilir. Masaüstü arayüzü için de `tsc` çalışmıyor.
  - Düzeltme: `npm run typecheck` ve `desktop` için `npx tsc --noEmit` adımı ekle.

- [x] 🟢 **Kaldırma sonrası artıklar**
  - Nerede: `desktop/src-tauri/windows/hooks.nsh` (`NSIS_HOOK_PREUNINSTALL`), `native_reg.rs`
  - Ne olur: Kaldırırken çalışan exe `lifetools-desktop.old*.exe` adıyla kenara alınıyor ama kimse silmiyor; Chrome native messaging kayıt defteri anahtarı ve `%APPDATA%\LifeTools\com.mehmet.lifetools.json` silinmiş exe'yi göstermeye devam ediyor.
  - Düzeltme: Kaldırma kancasında kayıt defteri anahtarını (`HKCU\Software\Google\Chrome\NativeMessagingHosts\com.mehmet.lifetools`) sil; `.old*.exe` için `Delete /REBOOTOK` kullan.

- [x] 🟢 **Pil eşiği tutarsız**
  - Nerede: `desktop/src-tauri/src/battery.rs` (`percent < threshold`) ↔ `desktop/src/views/piller.ts:142` (`percent <= 20` kırmızı)
  - Ne olur: %20'de kart kırmızı ama bildirim gelmez.
  - Düzeltme: İkisini aynı kurala çek.

- [x] 🟢 **Eski yorum: `features.rs`**
  - Nerede: `desktop/src-tauri/src/features.rs:3` ("desktop/src/features.ts ile aynı olmalı")
  - Düzeltme: Doğru dosya `src/core/desktop-features.ts`; yorumu düzelt.

---

## 6. Testler ve CSS

Okunanlar: `tests/` altındaki 68 dosyanın tamamı (+ `sqlite-memory.ts`), masaüstü Rust testleri (`db/tests.rs` ve modül içi `#[test]`ler, ~95 test), `design/tokens.css`, `design/components.css`, `src/panel/panel.css`, `src/popup/popup.css`, `src/modules/tab-manager/tabs.css`, `src/onboarding/welcome.css`, `src/onboarding/demos.css`, `src/modules/site-blocker/blocked.css`, `desktop/src/style.css`. `.skip` / `.only` / `#[ignore]` yok.

### 6a. Testler

- [ ] 🟠 **Bulunan bug'ların çoğunun testi yok** (bilgi; düzeltirken eklenmeli)
  - Test edilmeyen yerler: arka plan dinleyicileri (`tab-notes/background.ts` onRemoved, `slapmemo/background.ts` sayfa ipucu, `site-blocker/background.ts` storage dinleyicisi), `panel/panel.ts` `refresh`, `ig-ui.ts`, `x-video-ui.ts`, `tabs.ts` render akışı, `desktop/src-tauri/src/paste.rs` (hiç testi yok), `updater.rs` kurulum akışı.
  - Düzeltme: Her düzeltmeyle birlikte saf mantığı ayrı fonksiyona çıkarıp test et (ör. "aynı adreste başka sekme var mı", "hedef sekmeyi seç", `notesForUrl` SQL'i).

- [x] 🟠 **Bir test GIF bellek hatasını "doğru davranış" olarak kilitliyor**
  - Nerede: `tests/x-video-gif.test.ts:` `frameSize(200, 400)` → `{200, 400}` bekleniyor
  - Ne olur: Yükseklik sınırı eklenince (Bölüm 1 / 5'teki GIF maddesi) bu test kırılır; bilinçli olarak güncellenmeli.
  - Düzeltme: Testi "en uzun kenar 480" ya da piksel bütçesi kuralına göre yeniden yaz.

- [x] 🟠 **Test yardımcısı üretim kodunun kopyası**
  - Nerede: `tests/sqlite-memory.ts` (`batch`, `requireTransaction`, SAVEPOINT mantığı) ↔ `src/db/worker.ts:35-46`
  - Ne olur: Testler gerçek `worker.ts` yerine onun elle kopyasını sınıyor; biri değişip öteki değişmezse testler geçer ama eklenti bozulur.
  - Düzeltme: `worker.ts`'teki executor kurucusunu (`createWasmExecutor(sqlite3, db)`) dışa aktar; testler aynı fonksiyonu Node derlemesiyle kullansın.

- [x] 🟢 **Ölü kodun testi duruyor**
  - Nerede: `tests/command-center-utils.test.ts` (`parseTurkishDue`), komut "yuva" için test yok
  - Düzeltme: `parseTurkishDue` kaldırılınca testini de sil; `parsePrefix` için her komutun kayıtlı bir eyleme gittiğini doğrulayan test ekle (bu test "yuva" hatasını yakalardı).

- [x] 🟢 **Elle yazılmış listeler gerçek kayıtla eşlenmiyor**
  - Nerede: `tests/onboarding.test.ts` (`ids` dizisi elle yazılmış, `modules` kullanılmıyor), `tests/build-format.test.ts` (IIFE listesinde `ig-hook`, `ig-ui`, `currency-content`, `video-downloader-*` yok)
  - Düzeltme: `modules.map(m => m.id)` ve `manifest.json` / `replaceSiteScript` çağrılarındaki dosya adlarını kaynak olarak kullan.

- [x] 🟢 **HTML id denetimi yalnız Sekme Yöneticisi için var**
  - Nerede: `tests/saved-groups.test.ts:176` (`tabs.ts` ↔ `tabs.html`)
  - Ne olur: `panel.ts` ve bölümleri, `popup.ts`, `welcome.ts` onlarca `#id`'yi `as HTMLElement` ile kullanıyor; HTML'den bir id silinirse sayfa açılışta çöker ve test bunu yakalamaz.
  - Düzeltme: Aynı testi `panel.html`, `popup.html`, `welcome.html` için de çalıştır.

- [x] 🟢 **Eski/yanlış test başlıkları**
  - Nerede: `tests/migrations.test.ts:49` ("1 ve 2 sürümlerinden oluşur" — 1–12 denetleniyor), `:54` ("sürüm 2'ye ulaşır"), `tests/slapmemo-repo.test.ts:16` ("sürüm 6'e ulaşır")
  - Düzeltme: Başlıkları güncelle.

- [x] 🟢 **Kullanılmayan import**
  - Nerede: `tests/feature-defaults.test.ts:2` (en üstte `desktop/src/ambient` statik import ediliyor, sonra `window` taklidiyle dinamik import ediliyor)
  - Ne olur: Statik import yalnızca TS tarafından silindiği için çalışıyor; biri bu değeri kullanırsa test Node'da `window` hatasıyla düşer.
  - Düzeltme: Üstteki statik importu kaldır.

- [x] 🟢 **Otomatik link temizleme ile elle temizleme farklı kurallarda**
  - Nerede: `src/modules/link-cleaner/clean.ts` (`utm_` ile başlayan her parametre) ↔ `rules.ts` (DNR yalnız `TRACKING_PARAMS` listesindekileri siler); `tests/link-cleaner.test.ts` (`utm_a` elle temizlenir) / `tests/link-cleaner-rules.test.ts`
  - Ne olur: `utm_foo` gibi listede olmayan parametreler elle kopyalarken silinir, otomatik temizlemede kalır.
  - Düzeltme: DNR kuralına `regexSubstitution` ile `utm_*` desteği ekle ya da farkı yorumla belgeleyip testle sabitle.

- Masaüstü Rust testleri iyi durumda (DB, native host çerçeveleri, video argümanları, güncelleyici, eklenti klasörü). Eksik: `paste.rs`, `clipboard.rs` (`handle_update` akışı), `updater::check_and_install`.

### 6b. CSS

- [x] 🟢 **Yazı boyutu değişkenleri adlarıyla uyuşmuyor**
  - Nerede: `design/tokens.css:9` (`--font-size-18: 20px; --font-size-22: 20px;`)
  - Ne olur: `--font-size-18` 20px, `--font-size-22` de 20px; adı kullanan biri yanlış boyut alır.
  - Düzeltme: Değerleri adlarına göre düzelt ya da adları (`--font-size-title` gibi) anlamsal yap; etkilenen başlıkları gözle kontrol et.

- [x] 🟢 **Ortak input stili kaydırıcılara da uygulanıyor (olası görsel sorun)**
  - Nerede: `design/components.css` `input:not([type=checkbox])` → `type=range` ve `type=radio` da arka plan, kenarlık ve 8px dolgu alıyor (`popup.css` `#volume-slider`, masaüstü `.sound-card input[type=range]`)
  - Ne olur: Ses kaydırıcısı kutu içinde görünebilir. Ekranda doğrulanmadı.
  - Düzeltme: Seçiciyi `input:not([type=checkbox]):not([type=radio]):not([type=range])` yap.

- [x] 🟢 **Sayfaya enjekte edilen kutular kullanıcının tema seçimini izlemiyor**
  - Nerede: `src/core/page-theme.ts` (`PAGE_THEME` yalnız `prefers-color-scheme`) — SlapMemo baloncuğu, toast, sekme notu, döviz kutusu, Instagram düğmeleri
  - Ne olur: Eklentide "Koyu" seçip Windows'u açık temada kullanan biri sayfalarda açık renkli kutular görür.
  - Düzeltme: İçerik betikleri `ui_theme` ayarını okuyup host'a `data-theme` versin; `PAGE_THEME`'e `:host([data-theme=dark])` kuralları ekle.

- Diğer CSS'ler temiz: renkler değişkenlerle; açık/koyu tema hem `@media` hem `[data-theme]` ile karşılanıyor (panel, Sekme Yöneticisi, rehber, masaüstü); hareket azaltma tercihi sürükleme ve demolarda var; `demos.css`'teki sabit renkler bilinçli (çizim). `ui.test.ts` tokenlarda AA kontrastını denetliyor.

---

---

## 9. Güncellenen pil kodunun taranması (47ecc14)

Okunanlar: 22 yeni sürücünün tamamı (`astro`, `atk_keyboard`, `audeze`, `barracuda_pro`, `darmoshark`, `eightbitdo`, `endgame_we`, `fantech`, `finalmouse`, `jbl`, `logitech_g435_0adf.*`, `machenike`, `mchose_modern`, `moondrop`, `msi`, `nzxt`, `plantronics`, `royal_kludge`, `sprime`, `steelseries_elite`, `vaxee`); değişen sürücülerin eklenen kısımları (`razer_headset` tamamı, `aula`, `misc_mice` (Wraith W1), `airpods`, `hyperx`, `keychron`, `ninjutso`, `mchose`, `logitech`, `generic`, `xinput`, `corsair`); `devices.cpp`, `hid.cpp/h` farkları.

**Bellek güvenliği temiz:** Her yeni okumadan sonra uzunluk/sağlama denetimi var (Astro, JBL, NZXT, Plantronics, Moondrop, MSI, Steelseries Elite, Barracuda X akış ayrıştırıcısı, AULA HERO çerçeveleri, Mchose modern sağlama). Paylaşılan durumlar (`static` sayaçlar, AirPods yayın listesi) yoklama kilidi ya da `SRWLOCK` altında.

- [ ] 🟠 **AirPods: yakındaki başka birinin aynı model kulaklığı gösterilebilir** (tasarım; doğrulanmadı)
  - Nerede: `vendor/.../drivers/airpods.cpp` `Pick` / `PairedAppleAudio`
  - Ne olur: Bluetooth yayın adresleri değiştiği için sürücü yayını adrese göre değil **model + sinyal gücüne** (-80/-90 dBm) göre eşliyor; ayrıca sol/sağ/kutu yüzdelerini 15 sn içindeki **farklı yayınlardan** birleştiriyor. Aynı odada aynı model AirPods kullanan biri varsa onun pili ya da iki kişinin karışık değerleri görünebilir. Yeni sürümde dinleyici yalnızca bağlı değil **eşleştirilmiş** (kapalı/uzaktaki) Apple kulaklıklar için de başlıyor, yani Bluetooth taraması daha sık açık kalıyor.
  - Düzeltme: Üst kaynağa bildir; LifeTools tarafında "yalnızca bağlıyken göster" seçeneği düşünülebilir.

- [ ] 🟢 **Bazı sürücüler aygıtın durumunu geçici olarak değiştiriyor**
  - Nerede: `barracuda_pro.cpp`, `razer_headset.cpp` (`PollBarracudaX`: "remote mode" açılıp kapatılıyor), `logitech_g435_0adf.cpp` (`kSetMode 0x01` yazılıyor, oturum açılıp kapatılıyor), `finalmouse.cpp` (her yoklamada `wake/all` komutu).
  - Ne olur: Üretici yazılımlarının yaptığını taklit ediyorlar ve iş bitince geri alıyorlar; ama kapatma komutu gitmeden önce bir hata/kesinti olursa aygıt o modda kalabilir. Finalmouse'ta 5 dakikada bir "uyan" komutu farenin derin uykuya geçmesini engelleyip pil tüketebilir. Hiçbiri denenmedi (bu PC'de bu aygıtlar yok).
  - Düzeltme: Bilgi olarak dursun; sorun bildirilirse ilgili sürücü `build.rs` ile ya da `IgnoreDevices` ile kapatılabilir.

- [ ] 🟢 **Yoklama süresi uzayabilir**
  - Nerede: Yeni sürücülerde aygıt başına 1 sn'ye varan beklemeler (Plantronics: yanıt vermeyen kulaklıkta 3 ayrı 1 sn'lik bekleme; AULA: 4 sn'lik değişim; Barracuda Pro: 4 deneme × 6 okuma × 150 ms).
  - Ne olur: Bu aygıtlardan biri takılıyken ama kapalıyken tek yoklama birkaç saniye sürebilir; bu sırada genel pil kilidi tutulur, Ana sayfa özeti bekler. Bu PC'de (desteklenen aygıt yanıt vermezken) toplam ~1 sn ölçüldü.
  - Düzeltme: Bölüm 7'deki öneri geçerli: Ana sayfada son ölçümü göster, taze yoklamayı arka planda yap.

- [ ] 🟢 **Yeni özellik: `IgnoreDevices` kayıt anahtarı**
  - Nerede: `devices.cpp` `IgnoredDevices()` → `HKCU\Software\WirelessBattery\IgnoreDevices` (ör. `"046D:C547, 28BD:0947"`)
  - Ne olur: Listelenen VID:PID'lere hiçbir sürücü dokunmaz (çizim tabletleri gibi). LifeTools'ta arayüzü yok; anahtar adı üst kaynağın uygulama adıyla.
  - Düzeltme: Bir aygıt yoklamadan etkileniyorsa elle kullanılabilir; ileride Ayarlar › Piller'e "yoksayılan aygıtlar" eklenebilir.

---

## 8. Pil kütüphanesi güncellemesi (18 Kasım, commit edilmedi)

- [x] **Üst kaynak `3e2fb2e` → `47ecc14`'e güncellendi** (157 commit; 22 yeni sürücü, AirPods Max, Logitech çoklu alıcı, HyperX Haste 2, SteelSeries vb. düzeltmeler). Sürücü dosyaları üst kaynakla birebir aynı; tek yerel fark `devices.cpp`'den `PollHeadsetControl` satırı.
  - `build.rs`: `src/linux/` ve `report.cpp` (ağ isteği yapan "destek iste" penceresi) derlenmiyor; tanımlar üst kaynakla eşitlendi (`WIN32_LEAN_AND_MEAN` kaldırıldı, `_WIN32_WINNT/WINVER=0x0A00`); MSVC için `/Zc:lambda` ve `__FIReference_1_INT32 → __FIReference_1_int`.
  - `lifetools_bridge.cpp`: boş `report::DumpExtras` (yalnız `--dump` kullanıyordu).
  - `battery.rs`: yeni İngilizce bağlantı metinleri için Türkçe karşılıklar ve testleri ("2.4 GHz dongle or USB", "USB base station", "Base station", "Wireless adapter", "BT600 adapter").
  - `battery_win.rs`: elle donanım denemesi geri eklendi (`cargo test live_wireless -- --ignored --nocapture`).
  - `THIRD_PARTY_NOTICES.md`: yeni commit ve yerel farklar yazıldı.
  - Doğrulama: `cargo build` ✓, `cargo test` 89/89 ✓, canlı yoklama çalıştı (~1 sn) ama **0 aygıt** buldu — eski sürüm de 0 buldu, yani güncellemeden kaynaklanmıyor.

- [ ] 🟠 **Bu PC'deki ATK fare ve Razer kulaklık okunmuyor** (güncellemeden önce de)
  - Aygıtlar: ATK alıcı `373B:10C9` (Kysona sürücüsü kapsıyor), Razer BlackShark V2 Pro (2023) `1532:0555` (`razer_headset.cpp` kapsıyor).
  - Ne olur: 0.8.0'dan önce ATK fare için LifeTools'un kendi okuyucusu vardı (`battery_win.rs::read_wireless`, FF02 koleksiyonu, komut 04); 0.8.0'da C++ kütüphanesine geçilince kaldırıldı. Kysona sürücüsü aynı protokolü kullanıyor ama önce "bağlı mı" (komut 03) soruyor; fare uykudaysa ya da kapalıysa listelenmiyor. Deneme gece yapıldı; aygıtlar kapalı/uykuda olabilir.
  - Yapılacak: Fare ve kulaklık açıkken `cargo test live_wireless -- --ignored --nocapture` çalıştır. Yine çıkmazsa Kysona'nın 373B:10C9'da hangi koleksiyonu seçtiğine bak (eski kod FF02'yi kullanıyordu).

---

## 7. Üçüncü okuma: kalan dosyalar ve bağımlılıklar

Okunanlar: C++ pil kütüphanesi (`hid.cpp`, `hid.h`, `devices.cpp`, `lifetools_bridge.cpp`, `drivers.h`, `logitech.cpp` tamamı; diğer 43 sürücüde her HID okumasından sonraki uzunluk denetimleri, süreç/soket/iş parçacığı kullanımı), `build.rs`, HTML sayfaları (`popup.html`, `welcome.html`, `panel.html`: etiketler, düğme türleri, tekrarlanan id), `demos.ts`, `catalog.ts`, `desktop/src/api.ts`, `theme.ts`, `main.ts`, `toast.ts`, `design/icons.ts`, `scripts/readme-demos.mjs`. `npm audit` (kök + masaüstü) çalıştırıldı.

- [ ] 🟠 **Geliştirme araçlarında bilinen güvenlik açıkları**
  - Nerede: kök `package.json` geliştirme bağımlılıkları (vitest → `tinypool` vb.: 2 kritik, 1 yüksek, 3 orta), `desktop/package.json` (vite → `tinyglobby`/`fdir`/`picomatch`: 4 yüksek)
  - Ne olur: Kullanıcıya giden eklenti/uygulama paketinde açık yok (`npm audit --omit=dev`: 0). Açıklar yalnızca derleme/test makinesinde (bu PC ve GitHub Actions) çalışan araçlarda.
  - Düzeltme: Masaüstünde `npm audit fix` (kırıcı olmayan); kökte vitest'i güncel ana sürüme yükselt (kırıcı değişiklik, testleri çalıştırıp doğrula). `cargo install cargo-audit` ile Rust tarafını da denetle (bu PC'de kurulu değil, çalıştırılamadı).

- [ ] 🟢 **Pil yoklaması aygıtlara düzenli komut gönderiyor** (tasarım notu)
  - Nerede: `desktop/src-tauri/src/main.rs` (5 dk'lık döngü) + `dashboard_summary` / `battery_list` çağrıları → `vendor/wireless-battery` sürücüleri
  - Ne olur: Desteklenen fare/kulaklık/klavyelere 5 dakikada bir ve her Ana sayfa / Piller açılışında üretici protokolü istekleri (HID++ vb.) gidiyor; tüm yoklama birkaç saniye sürebiliyor (Galaxy Buds RFCOMM bağlantısı 4 sn'ye kadar bekliyor) ve bu sırada genel kilit tutuluyor. AirPods için başlatılan BLE dinleyicisi uygulama kapanana kadar açık kalıyor. Oyun sırasında ya da üretici yazılımı (G HUB, Synapse) açıkken etkisi denenmedi.
  - Düzeltme: Ana sayfa açılışında taze yoklama yerine son ölçümü göster; yoklama aralığını ayarlanabilir yap; BLE dinleyicisini yoklama bitince durdur.

- [ ] 🟢 **Kullanılmayan HeadsetControl sürücüsü**
  - Nerede: `vendor/wireless-battery/src/drivers/headsetcontrol.cpp` (`build.rs` derlemeden çıkarıyor, `PollAllDevices` çağırmıyor), `drivers.h:93` bildirimi duruyor
  - Ne olur: Bugün etkisiz. Yeniden açılırsa `headsetcontrol.exe`'yi `SearchPathW` ile PATH'te arıyor; PATH'teki yazılabilir bir klasöre konan aynı adlı dosya çalıştırılır.
  - Düzeltme: Bildirimi kaldır ya da dosyayı sil; açılacaksa yalnız uygulama klasöründen çalıştır.

- [ ] 🟢 **C++ derleme uyarıları kapalı**
  - Nerede: `desktop/src-tauri/build.rs:21` (`.warnings(false)`)
  - Ne olur: Üçüncü taraf koddaki olası hatalar (işaretsiz/işaretli karşılaştırma, kullanılmayan değişken vb.) görünmüyor.
  - Düzeltme: Arada bir uyarılar açık derleyip incele (`/W4`).

- [ ] 🟢 **`CreateEventW` sonucu denetlenmiyor**
  - Nerede: `vendor/wireless-battery/src/hid.cpp` (`Write`, `Read`, `SetOutputAndRead`)
  - Ne olur: Olay oluşturulamazsa (çok nadir) `WaitForSingleObject(NULL)` hemen hata döner, okuma iptal edilir; çökme yok, yalnız o aygıt okunmaz.
  - Düzeltme: `if (!ov.hEvent) return -1/false;`

- [x] 🟢 **Rehber metni baloncuğun yerini yanlış söylüyor**
  - Nerede: `src/onboarding/catalog.ts:16` ("altında çıkan baloncukta") ↔ `bubble-logic.ts` `bubblePosition` (önce seçimin **üstüne** konur, sığmazsa altına)
  - Düzeltme: "seçimin yanında çıkan baloncukta" gibi yaz.

- [x] 🟢 **Rehber animasyonlarında ölçüm ResizeObserver içinde sınıf değiştiriyor** (doğrulanmadı)
  - Nerede: `src/onboarding/demos.ts:246` (`aim()` → `demo-measuring` ekle/kaldır)
  - Ne olur: Sınıf boyutu değiştirirse konsolda "ResizeObserver loop" uyarısı çıkabilir; görsel etkisi beklenmez.
  - Düzeltme: Ölçümü `requestAnimationFrame` içinde yap.

**Temiz bulunanlar (üçüncü okuma):** C++ sürücülerinde her okumadan sonra uzunluk denetimi var (Logitech, Corsair, Jabra, ROG, Sonix, Steam, Mchose…); zaman aşımında `CancelIo` + bekleme doğru; `lifetools_bridge.cpp` JSON'u kaçışlıyor ve Rust kilit altında kopyalıyor; ATK seri port sürücüsü yalnız kendi VID'li portları açıyor. HTML: tüm girişler etiketli, tüm düğmelerin `type`'ı var, tekrarlanan id yok. Masaüstünde çağrılan her Tauri komutu Rust'ta kayıtlı (eksik/fazla yok). `build.rs`, `icons.ts`, `readme-demos.mjs` sorunsuz.

**Hâlâ yapılmayan:** Canlı deneme. Bulguların hiçbiri gerçek Chrome'da ya da masaüstü uygulamasında denenmedi; hepsi kod okumasından. `cargo audit` çalıştırılamadı.

---

**Sorunsuz bulunanlar (Bölüm 5, ikinci okuma):** Markdown çizici (innerHTML yok, yalnız http/https bağlantı), hızlı not, pano/şablon seçicileri, masaüstü Ayarlar (kısayol doğrulaması Rust'ta), ortam sesi motoru, pil okuma (C++ çağrısı kilit altında), izleme listesi DB kuralları, Tauri CSP ve yetkileri (`core:default`), yayın iş akışındaki sürüm denetimi, `manifest.key.txt` depoda (eklenti kimliği sabit), YouTube seçim çubuğu, SlapMemo baloncuğu, eklenti rehberi (her modül katalogda var), panel gezinmesi ve alt sekmeler.

## 10. 18 Kasım düzeltme turu (commit edilmedi)

Yukarıda [x] olan maddelerin hepsi bu turda düzeltildi. Doğrulama: `tsc` (eklenti + masaüstü) temiz, `vitest` 333/333, `cargo test` 90/90 (1 elle çalışan donanım testi atlandı), `npm run build` başarılı (yeni `dist.tmp` → `dist` akışıyla). **Hiçbiri gerçek Chrome'da ya da masaüstü penceresinde denenmedi.**

Notlar:
- Kaldırma kancası: yalnız `.old*.exe` dosyaları `Delete /REBOOTOK` ile siliniyor. Chrome native messaging kayıt anahtarı **bilerek silinmiyor**: güncelleme sırasında kaldırıcı çalışırsa eklenti bağlantısı kopardı (kayıt uygulama açılışında kendiliğinden yenilenmiyor). Kayıt Ayarlar'daki "Bağlantıyı kaldır" ile siliniyor.
- Uzun yedek: masaüstü DB'si WAL kipinde ve native host ayrı bağlantı kullanıyor; salt okunur `BEGIN DEFERRED` yazanı engellemez. Ek olarak `insert_clip` meşgulse 3 kez dener.
- Döviz yalnız HTTPS ve otomatik/elle `utm_*` farkı bilinçli karar olarak yorumla belgelendi, değiştirilmedi.
- Masaüstü şablon zamanları artık milisaniye; masaüstü migrasyon 5 eski saniye değerlerini ×1000 yapar.
- Yazı boyutu: `--font-size-18/22` gerçek değerlerini aldı; onları kullanan her yer yeni `--font-size-20`'ye geçti, yani ekranda boyut değişmedi.
- Kaydırıcı/radyo kutu stili kaldırıldı: ekranda bakılmadı.

Yapılmayanlar:
- `npm audit`: masaüstünde kırıcı olmayan düzeltme yalnız kilit dosyasını eşitledi; kalan vite 7 açığı (geliştirme sunucusu) `--force` ile vite 8'e geçmeyi istiyor. Kökte vitest ana sürüm yükseltmesi yapılmadı.
- Pil kütüphanesi (`vendor/`) maddeleri (`headsetcontrol` bildirimi, `CreateEventW` denetimi, uyarılar, AirPods eşleme, aygıt kipleri, yoklama süresi): üst kaynakla birebir tutulması için dokunulmadı.
- ATK fare / Razer kulaklık canlı denemesi: aygıtlar açıkken `cargo test live_wireless -- --ignored --nocapture`.

### 10a. Codex (gpt-6-luna, high) incelemesinden çıkanlar — düzeltildi

- [x] 🟠 `build.mjs`: yedek yol önce `dist`'i boşaltıp sonra kopyalıyordu. Artık yeniden adlandırma başarısızsa eski `dist` geri getirilir; yerinde güncellemede önce üzerine yazılır, ancak kopyalama bitince eski fazlalıklar silinir.
- [x] 🟠 `src/core/context-menu.ts`: `create` hatası yutuluyor, kısmi kurulum "uygulandı" sayılıyordu. Artık bir öğe kurulamazsa `appliedTree` boş kalır, sonraki kurulum baştan yapar.
- [x] 🟠 `src/modules/tab-manager/tabs.ts`: 150 ms'lik zamanlayıcı çalışırken `editing()` / `document.hidden` yeniden denetleniyor.
- [x] 🟠 `desktop/src-tauri/src/video_dl.rs`: kurulum kilidi atomik (`create_new`); başka canlı süreçteki kilit silinmez, yalnız bayat kilit (ölü PID ya da 30 sn'den eski boş dosya) kaldırılır. Masaüstü ve native host aynı anda kurulum başlatamaz. (Önceden de vardı.)
- Doğrulama: `tsc` temiz, vitest 333/333, `cargo test` 90/90, `npm run build` başarılı. Kilit yarışı ve menü hatası için test yok; canlı denenmedi.
- Codex Görev 2'de (projenin geri kalanı) ek bulgu bildirmedi, ama depoyu dosya dosya taramadığını söyledi.

### 10b. Codex ikinci tur (gpt-6-luna, high) — düzeltildi

- [x] 🟠 `src/core/site-scripts.ts` `releaseOrigin`: Metin Kısayolları / Araç Çubuğu'ndan site kaldırılınca diğer modüllerin sabit izinleri (YouTube/IMDb izleme düğmesi, YouTube indirme, Steam döviz) de geri alınabiliyordu. `FIXED_MODULE_ORIGINS` artık hiç geri alınmıyor. Test: `tests/release-origin.test.ts`.
- [x] 🟢 `video_dl.rs` `begin_install`: kilit alındıktan sonraki hata yolları (`current_exe`, PID yazımı, `spawn`) kilidi bırakmıyordu. `InstallLockGuard` her hata yolunda kilidi siler, yardımcı başlatılınca kilidi ona bırakır.
- [x] 🟠 `video_dl.rs` `acquire_install_lock`: bayat kilit silinirken başka sürecin yeni kilidi silinebiliyordu. Bayat kilit önce sürece özel bir ada taşınıyor (yalnız bir süreç kazanır), taşınan dosya hâlâ bayatsa siliniyor, değilse geri konuyor. Testler: `install_lock_tests` (4).
- Kabul edilen sınır: `build.mjs` yerinde kopyalama yolu (`dist` kilitliyken) atomik değil; yarıda kalırsa `dist` eski/yeni karışık olabilir ama boşalmaz.
- Katılmadığım bulgu: `db/dashboard.rs` yedeğin `schema_version` okuması doğru; yedek eklenti tablolarını taşır, geri yüklemede eklenti şema sürümü gerekir.
- Doğrulama: `tsc` temiz, vitest 335/335, `cargo test` 94/94, `npm run build` başarılı. Canlı denenmedi.

### 10c. Sekme Yöneticisi birikmesi + Codex üçüncü tur (gpt-6-luna, high) — düzeltildi

- [x] 🔴 Bir pencerede birden çok sabit `tabs.html` birikiyordu (kullanıcıda 3 tane). Temizlik yalnız pencere açılışı, `onInstalled`/`onStartup` ve ayar değişiminde çalışıyordu; oturum geri yüklenirken sabit sekme 1 sn'lik kontrolden geç gelince yenisi açılıyordu, panel düğmesi de her tıklamada yeni sekme açıyordu. Şimdi: Yönetici sekmesi açılınca/yüklenince/taşınınca o pencere toparlanıyor (`onlyDedupe`: ayar kapalıyken kullanıcının açtığı sekmeye dokunmaz), açılışta 15 sn sonra ikinci tur, `?`/`#` farkını yok sayan eşleme (`manager-tab.ts`), panel düğmesi `openTabManager` kullanıyor.
- [x] 🟠 Sekme başka pencereye sürüklenince kaynak pencere toparlanmıyordu: `onDetached` eklendi.
- [x] 🟢 `open.ts`: `url || pendingUrl` yerine ikisi ayrı denetleniyor.
- [x] 🟢 `zombie-tabs/background.ts`: kapanan sekme `active` haritasında kalınca sonraki etkinleştirme onu `last`'a geri yazıyordu (`storage.session` içinde kapalı sekme kimlikleri birikiyordu). Artık kapanışta iki haritadan da siliniyor.
- Doğrulama: `tsc` temiz, vitest 336/336, `npm run build` başarılı. Gerçek Chrome'da denenmedi.

### 10d. Steam paket fiyatı yanlış TL — düzeltildi

- [x] 🟠 `src/modules/currency/rates.ts` `steamFinalAmount`: "Koleksiyonunu tamamla" paketlerinde Steam görünen fiyatı sahip olunan oyunlara göre yeniden yazıyor ($4.75), ama `data-price-final` paketin düz fiyatında kalıyor ($6.02). Kod özniteliği tercih ettiği için 303,64 ₺ gösteriyordu (doğrusu ~239,59 ₺). Artık görünen metin esas, öznitelik yalnız metin okunamazsa. Test: `tests/currency.test.ts`. Kullanıcı gerçek Steam sayfasında doğruladı (18 Kasım).
