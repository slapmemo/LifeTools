# LifeTools — Kaldığımız Yer

> Son güncelleme: 17 Kasım 2026 · sürüm **0.7.0 hazır ama YAYINLANMADI** · dal master, origin'den **8 commit önde** (push edilmedi)
> Yeni bir sohbete/oturuma başlarken önce bu dosyayı oku. Tasarım ilerlemesi: `design/YENIDEN-TASARIM.md`. Sürüm notları: `release-notes/`. Eski planlar: `../LifeTools_Plan_v3_2026-11-06.md`, `../LifeTools_Arayuz_Plani_2026-11-06.md`, `../LifeTools_Ozellik_Rehberi_2026-11-08.md`.

## 0. Şu an neredeyiz (17 Kasım akşamı)

**Özellik rehberine animasyonlar eklendi (0.7.0'a dahil):** `src/onboarding/demos.ts` + `demos.css`. 11 özellik için CSS ile döngülü mini animasyon (SlapMemo baloncuğu, link temizleme, Sekme Yöneticisi, Pencere Kaydetme, Süre takibi, Ses yükseltici, Resim içinde resim, YouTube / X / Instagram indirme, Steam döviz). Düğme adları gerçek arayüzden alındı; arayüz değişirse animasyon da güncellenmeli. İmlecin hedefleri `data-aim` ile ölçülür (`--ad-x/-y`). Hareket azaltma açıksa döngünün %75'inde durur. Kullanıcı ileride bazı özellikler için gerçek ekran kaydı (WebM) da ekleyebilir. Not: SlapMemo'yu insanlar Alt+S ile değil seçim baloncuğundaki "📝 Not" ile kullanıyor; rehber metinleri buna göre.

**Yayınlanmayı bekleyen 0.7.0** (8 commit, sürüm dosyaları 0.7.0'a yükseltildi, `release-notes/v0.7.0.md` ve `src/core/whats-new.ts` `CHANGELOG` girişi yazıldı). İçerik:
- Kayıtlı gruplar tek yerde (Sekme Yöneticisi); paneldeki liste yerine sayı + kısayol; her yerde "oturum" → "kayıtlı grup". Düzeltme: "Etiket ve notlar" bölümü Sekmeler'in diğer sekmelerinde de görünüyordu.
- Kaldırıldı: Komut Merkezi sayfası (açılır penceredeki arama artık hep açık; arama kodu `src/core/command-search.ts`), Sabit Sekme Koruyucu, Sekme Değiştirici (Alt+Q). "zombiler" komutu ve zombi bildirimi → `panel.html#zombiler` (Sekmeler › Temizlik); "kopyalar" → `panel.html#sekmeler`.
- Resim içinde resim düğmesi: imleç konumuyla bulunuyor (üstte saydam katman olan sitelerde de çıkıyor), en küçük video 96×54, düğme görünen alanda kalıyor, tıklama oynatıcıyı durdurmuyor, rAF yerine 50 ms zamanlayıcı. YouTube ve küçük videoda gerçek tarayıcıda denendi.
- Temizlik: masaüstü ana sayfa özetinden Görevler ve ortam sesi kalıntıları; LifeBrowser'ın görünen adı "Pencere Kaydetme".
- **Özellik rehberi** (`src/onboarding/welcome.*`, `catalog.ts`, `src/core/whats-new.ts`): 3 kip — ilk kurulum (`?setup=1`: sabitle, masaüstünü bağla, özellikleri seç, ilk denemeler), güncelleme sonrası (`?from=0.6.0`: Yenilikler kartı + Yeni/Güncellendi rozetleri; arada `CHANGELOG` girişi varsa güncellemede kendiliğinden açılır, `whatsNewSeenVersion` anahtarı), rehber (`?guide=1`: Panel › Ayarlar › Araçlar'daki düğme ve açılır penceredeki "Özellikler ve yenilikler"). Kısayollar `chrome.commands.getAll()` ile canlı okunur.
- Yayın: kullanıcı onay verince `git push origin master` + `git tag v0.7.0 && git push origin v0.7.0`, sonra akışı izle, dosyaları ve sürüm notunu doğrula.

**Kurallar (bu oturumda konuşuldu):** sürümler semver (düzeltme = yama, görünür özellik/kaldırma = küçük sürüm; 1.0 kullanıcı "kararlı" deyince). Her yayında `release-notes/vX.Y.Z.md` **ve** `whats-new.ts` `CHANGELOG` girişi (test, üstteki giriş manifest sürümüne eşit değilse kırılır). Commit öncesi Türkçe karakter taraması.

**Önizleme yöntemi (eklenti sayfaları, Chrome olmadan):** masaüstü Vite sunucusu açıkken (`desktop/.claude/launch.json` → `desktop-ui`, port 1420) `http://localhost:1420/@fs/<proje yolu>/dist/<sayfa>.html` açılır, sahte `window.chrome` (Proxy ile eksik API'ler boş döner) konup `await import('./<sayfa>.js?mock=' + Date.now())` çalıştırılır. Proje OneDrive'da olduğu için Vite bazen dosya değişikliğini kaçırır: sunucuyu yeniden başlat.

**Açık işler (öncelik sırası):**
1. 0.7.0'ı yayınla ve **otomatik güncellemenin bu PC'de gerçekten çalıştığını doğrula** (hiç doğrulanmadı; rehberin güncellemede açılması da ancak böyle görülür).
2. Sekme Yöneticisi'ne mockup'taki site filtre hapları ("Tümü 14 · YouTube 7 · X 2 · Diğer 5") — kullanıcı en çok bu sayfayı kullanıyor.
3. Engel sayfası (`blocked.html`) yalnızca renkleri aldı; eklentinin açık teması hiç kontrol edilmedi; masaüstü gerçek pencerede sayfa sayfa gezilmedi.
4. Kullanımı sorulmamış modüller: Link Temizleyici, Başlık Temizleyici, Site Engelleyici, video indiricilerin üçü, Ses Yükseltici; masaüstünde Ortam sesi, Piller, seçiciler. Akıllı Yanıtlar yeni kurulumlarda zaten kapalı (önerilenlerde değil). Kullanıcının kalsın dedikleri: Pano Yuvaları, Döviz, Site Araç Çubuğu, Etiket/Not, Zombi, Notlar'ın iki ekranı (masaüstü + panel).

## 1. Durum özeti

LifeTools GitHub'da herkese açık (`slapmemo/LifeTools`); projeye bilerek lisans eklenmedi. Eklenti (Chrome MV3) ve masaüstü (Tauri 2.11, Windows) aynı sürümü kullanır ve Native Messaging ile bağlıdır.

| Alan | Durum |
|---|---|
| Sürüm | Yayında son: **0.6.0** (`v0.5.5`–`v0.6.0` GitHub Actions ile; yükleyici, `.sig`, `latest.json`, eklenti ZIP'i; sayfa metni `release-notes/<etiket>.md`'den). 0.7.0 yerelde hazır. |
| Otomatik güncelleme | Masaüstü imzalı güncellemeyi kendisi kurar; eklentiyi `%LOCALAPPDATA%\LifeTools\extension` klasöründe güncel tutar; eklenti oradan yüklendiyse kendini yeniden yükler. **Hâlâ hiçbir bilgisayarda doğrulanmadı.** |
| Testler | Eklenti 306 test (`npx vitest run`), masaüstü 88 test + 1 elle donanım testi (`cargo test`; `cargo test live_wireless -- --ignored --nocapture`). |
| İlk kurulum / rehber | Yeni kurulumda `welcome.html?setup=1` açılır; önerilen modüller açık gelir (`src/core/onboarding.ts` `RECOMMENDED_MODULES`). 0.7.0'dan itibaren güncellemede de (yenilik varsa) açılır; her zaman Panel › Ayarlar ve açılır pencereden açılır. |
| Arayüz | 0.5.10'da tasarımcı teslimine göre masaüstü + eklenti yeni tasarımda (ayrıntı `design/YENIDEN-TASARIM.md`). Tepsi ikonu yapraklı logo (0.6.0). |

### 0.5.9 (16 Kasım) — otomatik güncelleme döngüsü düzeltmesi
- **Sorun:** 0.5.7 → 0.5.8 otomatik güncellemesi «Error opening file for writing: lifetools-desktop.exe» verip döngüye girdi. Chrome'un native host işlemi (aynı exe) dosyayı kilitli tutuyor; yükleyici yazamıyor, uygulama eski sürümle açılıp aynı sürümü yeniden indiriyordu.
- **Düzeltme:** `desktop/src-tauri/windows/hooks.nsh` (`nsis.installerHooks`): kurulum ve kaldırma öncesi çalışan exe `lifetools-desktop.old*.exe` olarak yeniden adlandırılır (Windows buna izin verir). Uygulama açılışta ve 2 dk sonra bu kopyaları siler (`updater::cleanup_old_binaries`). Otomatik güncelleme aynı sürümü 12 saat içinde tekrar denemez (`update_attempt` ayarı, `updater::should_skip`); elle denetleme her zaman çalışır.
- Bu PC'de kilitli exe ile iki kez denendi: yükleyici elle müdahale olmadan başarılı.
- 0.5.7/0.5.8 kurulu makineler 0.5.9'u eski güncelleyicileriyle indirir ama kurulumu yeni yükleyici yapar, kanca orada çalışır.

### 0.5.8 (15 Kasım)
- **Masaüstü İzleme listesi:** `watch_items` üzerinde ekleme, sayılı durum sekmeleri, tür süzgeci, arama, satırda durum değiştirme, düzenleme, geri alınabilen silme (`desktop/src/views/izleme.ts`, `db/watch.rs`).
- **ATK fare pili:** USB alıcılı ATK/Compx (VID 373B) fareler, üretici arayüzü (usage page 0xFF02, 17 baytlık rapor 0x08) üzerinden komut 0x04 ile okunur; sağlama = 0x55 − ilk 16 baytın toplamı; cevapta 5. bayt veri uzunluğu, 6. yüzde, 7. şarj. Yalnız okuma, zaman aşımlı (`battery.rs`, `battery_win.rs::read_wireless`). Kaynak: libatk-rs (GPL; kod kopyalanmadı). Razer/Logitech alıcıları desteklenmiyor.
- **Ortam sesi düzeltmesi:** `.switch` içinde `.switch-track` yoksa düğme sıfır boyutta kalır; kanal seçilemiyordu.
- **Kaldırılanlar:** masaüstünde Elektrik ve Görevler yer tutucusu, ana sayfa görev kartı; eklentide `quick-tasks` modülü (panel, popup, Komut Merkezi, baloncuk, sağ tık, araç çubuğu, kısayol). `tasks` tablosu ve yedeği duruyor; eski `task-due:` alarmları açılışta temizlenir. Kurulum dosyası LT ikonu, `legacy-x-prototype` silindi.

### 0.5.7 (15 Kasım)
- **Masaüstü Notlar (U4'ün ilk parçası):** eklentiyle ortak not ekranı. Sayılı sekmeler + Arşiv, sıralama, tamamlananları gizle, `#etiket` çubuğu ve aramada `#etiket`, Markdown (başlık, liste, tıklanabilir `- [ ]`, kalın/eğik/kod, bağlantı; `desktop/src/markdown.ts`, innerHTML yok), sabitleme, tamamlandı, arşiv, hatırlatma (Windows bildirimi, 20 sn'de bir `take_due_reminders`), eklentinin kaydettiği görsel ve sayfa metni, satırda kategori değiştirme ve kopyala, 6 sn geri alınabilen silme, büyüyen ve boyutu hatırlanan ekleme kutusu.
- **`note_meta` tablosu:** sabit/tamamlandı/arşiv/hatırlatma burada; `notes`'a sütun eklenmez. Eklenti migrasyon 11 ve masaüstü `NOTE_META_DDL` aynı `CREATE TABLE IF NOT EXISTS` ifadesi (test `tests/note-meta.test.ts` eşitliği denetler). Yedekte var; eklenti arşivlenenleri listede/aramada gizler, sabitlenenleri önce gösterir.
- **Hızlı not:** `Ctrl+Alt+N` veya tepsi «Hızlı not» → `quicknote` penceresi (`desktop/src/quicknote.ts`).
- **Kısayollar kapatılabilir:** boş metin = kapalı (kaydedilmez); Ayarlar'da her kısayolun aç/kapa kutusu, «Tümünü kapat», «Varsayılana dön» (bu düğme ve hata metni daha önce sayfaya hiç eklenmemişti).
- **Üstte tutma kaldırıldı:** `Ctrl+Alt+T`, tepsi öğesi, Pencereler sayfası, `windows_*` komutları ve ilgili Win32 kodu.
- **Sekme yöneticisi:** sekmeyi kayıtlı gruba kaydetme kısayolu (`save-tab-to-group`), sürükle-bırak, sağ tık menüsü (`menu-logic.ts`, `saved-group-append.ts`).

### 10 Kasım oturumunda eklenenler
- **Instagram:** görünmeyen/kırpılmış/pencere arkasındaki videolarda düğme ve çubuk yok; Keşfet ızgarasında kontrol yok; ana sayfa düzeltmesi (`<html>`/`<body>` kırpıcı sayılmaz); hız düğmesi menü açar (0,5×–3×, tekerlekle adım). Tek ortak zamanlayıcı (`src/modules/instagram/scheduler.ts`), oynatırken kare başı hesap yok.
- **Video İndirici (YouTube):** boyutlar sayfadaki oynatıcı verisinden anında (`yt-main.ts`, MAIN dünyası); oynatma listesi indirme (tümü veya «Videoları seç…» ile seçilenler, onay kutuları + alt çubuk, Shift ile aralık); düğme «Tümünü oynat» satırının altında, bulunamazsa sol altta yüzer; gizli liste uyarısı; MP3 en yüksek VBR (`--audio-quality 0`); durum etiketi yalnızca o sayfanın indirmesini gösterir; masaüstü yalnızca süren iş varken ve sekme görünürken sorgulanır.
- **Döviz Çevirici (yeni modül `currency`):** ECB kuru (api.frankfurter.dev, 6 saat önbellek); Steam'in tüm mağaza sayfalarında fiyatlar Steam'in kendi kutusunda TL (tıklayınca o sayfada dolar); tüm sitelerde üstüne gelince/seçince TL ipucu (varsayılan kapalı, tüm site izni ister); «5 Mark», «5 euro», «10 dolar» gibi yazılar (DM sabit kur 1,95583); SlapMemo baloncuğunda seçili fiyatın TL'si.
- **Performans:** iki bağımsız inceleme turu yapıldı, bulunan 20 sorunun hepsi düzeltildi (sonsuz rAF döngüleri, saniyelik native host çağrısı, kapalıyken dinleyiciler, Steam tam sayfa taramaları).
- **0.5.6 (Fable incelemesi, 17 madde):** indirme işi işlem kimliği + başlama zamanı + günlük yaşıyla doğrulanıyor (PID yeniden kullanımı); video sorguları ve sürüm kontrolü kalıcı masaüstü bağlantısından (`src/db/host.ts` `nativeRequest`), yalnız arka plan sorguluyor (`videoDownloadJobsSnapshot`); yedek geri yükleme arka planda, kilit altında (`withExclusiveDb`), tek `BEGIN IMMEDIATE` işlemi, parçalı `batch` + `requireTransaction`; uyarlanır dışa aktarma ve otomatik yedek hata uyarısı; DB köprüsü yalnız eklenti sayfalarını kabul ediyor; kapalı Instagram/X kancaları yanıt okumuyor; ortak `downloads.subfolder`; `replaceSiteScript` yalnız değişince güncelliyor; release önce taslak, sonra yayımlanıyor.
- **Diğer:** worker.ts bozuk yorum, `db.rs` → `db/` alt modülleri, `panel.ts` → `src/panel/sections/`, eski dallar silindi, eski notlar `../arsiv/`.

## 2. Sıradaki adımlar

1. Otomatik güncellemeyi doğrula: 0.5.5 kurulu bilgisayarda masaüstü 0.5.6'ya kendiliğinden geçti mi (Ayarlar › Güncellemeler › Güncellemeleri denetle), eklenti `%LOCALAPPDATA%\LifeTools\extension`'dan yüklüyse 0.5.6 oldu mu? Olmadıysa güncelleyici günlüğüne/hata metnine bak. 0.5.5 kurulu değilse 0.5.6'yı elle kur, deneme 0.5.7'de.
2. 0.5.6 değişikliklerini dene: Panel'den yedek al ve geri yükle (masaüstü arka ucu ile), YouTube'da indirme sırasında Görev Yöneticisi'nde `lifetools-desktop.exe` sayısı artmamalı.
3. Kullanıcı testleri: YouTube liste seçerek indirme, Steam ana sayfa TL, Instagram ana sayfa/Keşfet, popup ses kartı.
4. 0.5.7'yi gerçek kullanımda dene: hatırlatma bildirimi geliyor mu, `Ctrl+Alt+N`, eklentide arşivlenen notun gizlenmesi (eklentide ↻ sonrası migrasyon 11).
5. U4 tamam (Görevler kullanıcı isteğiyle kaldırıldı). U5 (CC0 ortam sesleri; önce aday listesi, kullanıcı onayı) bekliyor.
6. İsteğe bağlı: hafif takip engelleme modülü (önerildi, kullanıcı «her neyse» dedi), SmartScreen için kod imzalama.

## 3. Nasıl çalıştırılır

- **Eklenti:** `npm install` → `npm run build` → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`. Değişiklikten sonra `npm run build` + eklentide ↻.
- **Masaüstü:** `cd desktop` → `npm install` → `npm run tauri dev`. Testler: `cd desktop/src-tauri && cargo test`. Yükleyici: `npm run tauri build` (önce kökte `npm run build`, çünkü `dist/` yükleyiciye `extension/` olarak gömülür).
- **Yayın:** tüm sürüm dosyalarını yükselt (aşağıda), commit, `git tag vX.Y.Z` + `git push origin vX.Y.Z`. `.github/workflows/release.yml` sürüm uyuşmazsa durur; derler, imzalar, `latest.json` ve `LifeTools-extension-X.Y.Z.zip` yükler. README'de «Sürüm yayınlama ve otomatik güncelleme» bölümü var.
- **Sürüm dosyaları:** `package.json`, `package-lock.json` (2 yer), `src/manifest.json`, `desktop/package.json`, `desktop/package-lock.json` (2 yer), `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`, `Cargo.lock` (`lifetools-desktop` girdisi). Küçük yama adımları (0.5.8 → 0.5.9); kullanıcı büyük atlama istemiyor.

## 4. Bilinmesi gerekenler (tuzaklar)

- **Anahtarlar `%USERPROFILE%\.lifetools-keys\`:** `ext-key.pem` (eklenti kimliği), `updater.key` + `updater.key.password` (güncelleme imzası). **Silme, depoya koyma, yedeğini al** — `updater.key` kaybolursa kurulu uygulamalara bir daha güncelleme gönderilemez. GitHub sırları: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (eklendi).
- **Eklenti kimliği sabit:** `laejkffjeefcodgkhkgppbfimbkoppih` (`src/manifest.key.txt`, açık anahtar).
- **Tauri 2.11'e sabit:** `tauri 2.11.6`, `tauri-runtime 2.11.3`, `tauri-runtime-wry 2.11.4`, `tauri-macros/codegen 2.6.3`. `cargo update` çalıştırma. Güncelleyici `tauri-plugin-updater = "=2.12.0"` (2.13+ Tauri 2.12 ister). Yeni crate eklerken önce crates.io'da `tauri` gereksinimine bak, sonra sabit sürümle `cargo add`, ardından kilitli sürümlerin değişmediğini kontrol et.
- **BOM yok:** `tauri.conf.json`'a BOM girerse okunamaz.
- **YouTube Trusted Types:** YouTube sayfasında `innerHTML` atamak yasak; içerik betiklerinde DOM öğeleri oluştur.
- **YouTube DOM (2026):** oynatma listesi başlığı `yt-page-header-view-model` + `yt-flexible-actions-view-model` (sınıflar `ytFlexibleActionsViewModelAction` gibi bitişik). Satırlar oturum açıkken `ytd-playlist-video-renderer`, açık değilken `yt-lockup-view-model`. Gizli ana sayfa `ytd-browse` da DOM'da kalır; her zaman görünür olanı seç. Oturum açmamış tarayıcıda gizli listeler görünmez.
- **Steam DOM:** klasik fiyatlar `.discount_final_price`/`.discount_original_price`/`.game_purchase_price` (+ `data-price-final` kuruş); React bölümleri karışık sınıf adları kullanır → içinde yalnız fiyat yazan yaprak öğeler bulunur (`isStandalonePriceText`). Döngü koruması yalnızca fiyat öğesinin kendisine bakmalı (kapsayıcıya bakınca tüm bölümler kilitlenmişti).
- **Native host:** `sendNativeMessage` her çağrıda yeni işlem başlatır; zamanlayıcıyla sık çağırma. Sık istekler `src/db/host.ts` `nativeRequest` ile kalıcı bağlantıdan gitmeli; `sendNativeMessage` yalnız klasör seçici ve büyük `video_formats` yanıtı için.
- **Çok adımlı DB işlemleri:** sayfadan (Panel) mesaj mesaj `BEGIN … COMMIT` yürütme; bağlantı yeniden kurulursa veya başka istek araya girerse veri kaybolur. Arka planda `withExclusiveDb` içinde yap, parçalara `requireTransaction: true` ver (bkz. `restoreBackground`/`exportBackground`).
- **Release akışı:** `tauri-action` taslak release oluşturur; eklenti ZIP'i `gh release upload` ile eklenir, en son `gh release edit --draft=false --latest`. `softprops/action-gh-release` taslakları etiketle bulamaz, kullanma.
- **Model durumu (10 Kasım):** Codex Terra kotası sık doluyor (doluysa `--level 3 --model claude/sonnet`). Agent aracındaki «fable» modeli Fable 5.1'dir; kullanıcının genel kuralı Fable'ı yasaklar, yalnız kullanıcı açıkça isterse kullan.
- **Sayfa betiklerinde performans:** `getComputedStyle`/`elementsFromPoint`/tam sayfa `querySelectorAll` işlerini kare başına, fare hareketinde veya her MutationObserver kaydında yapma; rAF ile birleştir, kapalıyken dinleyicileri kaldır.
- **Arka plan sunucuları `dist/` içinde çalışmasın:** `npm run build` `dist/`'i silerken EBUSY verir. Demo/test sunucularını kopya klasörden aç.
- **Delegeler:** `cargo` çalıştıramaz; doğrulayıcı `~/.cargo/bin`'i PATH'e eklemeli; komutlarda `!` yerine bash betiği; Windows Python'u `/c/...` yollarını açamaz (`cygpath -w` kullan). Terra bazen işi yarım bırakır → bağlantı kontrolleri koy. Türkçe karakter bozulması taraması: `grep -E "[a-zA-Zçğışöü]\?[a-zA-Zçğışöü]"` (`\x3f` ile yazılmış `?` normaldir).
- **Masaüstünde yazarken genişletme bilerek yok** (küresel klavye kancası riski).
- **Kilitli exe:** Chrome eklentisi native host üzerinden `lifetools-desktop.exe`'yi açık tutar. 0.5.9'dan beri yükleyici kancası (`windows/hooks.nsh`) çalışan exe'yi kenara alır; elle kurulumda ek adım gerekmez. 0.5.8 ve öncesinin yükleyicileri bunu yapmaz.
- **Veri kurtarma (WAL):** `%APPDATA%\LifeTools\lifetools.db` WAL kipinde; ana dosya yalnız checkpoint'te yazılır. Silinen veri, ana dosyanın **kopyası** WAL'sız açılarak (son checkpoint hali) ya da WAL'ı commit commit kopyada yeniden oynatarak bulunabilir. Asıl dosyalara dokunma.
- **Tauri eklentileri sabit sürüm:** `tauri-plugin-notification = "=2.4.0"` (Tauri 2.11 ile uyumlu).

## 5. Kısayollar (varsayılan)

| Tuş | İşlem |
|---|---|
| Alt+S | Seçimi (yoksa sayfayı) SlapMemo'ya kaydet |
| Alt+Q | Görsel sekme değiştirici |
| Alt+K | Komut Merkezi |
| Alt+P | Resim içinde resim |
| Shift+< / Shift+> (Instagram, fare videodayken) | Reels hızı |
| Ctrl+Alt+V (masaüstü) | Pano geçmişi seçici |
| Ctrl+Shift+Space (masaüstü) | Şablon seçici |
| Ctrl+Alt+N (masaüstü) | Hızlı not |

## 6. Commit geçmişi (özet)

| Commit | İçerik |
|---|---|
| `1dc39f1` | v0.1 iskelet, X engelleyici, SlapMemo |
| `09f64b6` … `fa9c666` | v0.2 sekme araçları, Command Center, Kısayollar, Araç Çubuğu |
| `44e69d0`, `e72a163` | v0.3 İzleme Listesi, PiP, Pano Yuvaları, X Video |
| `a101a27` … `2e02b4c` | v0.4 masaüstü + Native Messaging köprüsü |
| `380b70a` … `9ef2b8e` | "Sade" tasarım (etiket `before-redesign`) |
| `da340d9` … `8f6b543` | Instagram indir + çubuk, video indirici, Ses Yükseltici, 0.5.0–0.5.2 |
| `29a2a15` … `d237aa8` | Bakım, Instagram katman düzeltmeleri, karşılama sayfası, yeni arayüz |
| `b4bd989` … `0f1d85e` | Oynatma listesi indirme, Döviz Çevirici, seçerek indirme, 0.5.3–0.5.4 |
| `86feee6` … `48d3635` | Performans düzeltmeleri, otomatik güncelleme, yayım iş akışı, 0.5.5 |
| `885947d` … `115216a` | Fable incelemesi (17 düzeltme), atomik geri yükleme, taslak release akışı, 0.5.6 |
| 0.5.9 | Yükleyici kilitli exe'yi kenara alır, otomatik güncelleme döngü koruması |
| 0.5.8 | Masaüstü İzleme listesi, ATK fare pili, ortam sesi düzeltmesi; Elektrik ve Görevler kaldırıldı |
| 0.5.7 | Sekme yöneticisi eklemeleri, masaüstü Notlar + `note_meta`, hızlı not, kapatılabilir kısayollar, üstte tutma kaldırıldı |
