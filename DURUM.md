# LifeTools — Kaldığımız Yer

> Son güncelleme: 10 Kasım 2026 (akşam) · sürüm 0.5.6 · dal master (`v0.5.6`: Fable incelemesindeki 17 düzeltme)
> Yeni bir sohbete/oturuma başlarken önce bu dosyayı oku. Eski planlar: `../LifeTools_Plan_v3_2026-11-06.md`, `../LifeTools_Arayuz_Plani_2026-11-06.md`, `../LifeTools_Ozellik_Rehberi_2026-11-08.md`.

## 1. Durum özeti

LifeTools GitHub'da herkese açık (`slapmemo/LifeTools`); projeye bilerek lisans eklenmedi. Eklenti (Chrome MV3) ve masaüstü (Tauri 2.11, Windows) aynı sürümü kullanır ve Native Messaging ile bağlıdır.

| Alan | Durum |
|---|---|
| Sürüm | 0.5.5. `v0.5.5` etiketi GitHub Actions yayım iş akışını başlattı (ilk otomatik yayın; sonucu Releases'te kontrol et). |
| Otomatik güncelleme | Yeni. Masaüstü imzalı güncellemeyi kendisi kurar; eklentiyi `%LOCALAPPDATA%\LifeTools\extension` klasöründe güncel tutar; eklenti oradan yüklendiyse kendini yeniden yükler. İlk gerçek deneme 0.5.6 yayınında olacak. |
| Testler | Eklenti 256 test (vitest), masaüstü 77 test (`cargo test`). |
| İlk kurulum | Yeni kurulumda karşılama sayfası (`welcome.html`) açılır; önerilen modüller açık gelir (`src/core/onboarding.ts` `RECOMMENDED_MODULES`). Panel › Ayarlar'dan yeniden açılır. Güncellemede açılmaz. |
| Arayüz | Panel, sekme değiştirici ve popup «yeni» tasarımda (yazılı kenar menüsü, mor vurgu #A69CFF, gerçek LT logosu satır içi SVG). Tasarım tuvali: claude.ai artifact «LifeTools Yeni Arayüz». |

### Bu oturumda eklenenler (10 Kasım)
- **Instagram:** görünmeyen/kırpılmış/pencere arkasındaki videolarda düğme ve çubuk yok; Keşfet ızgarasında kontrol yok; ana sayfa düzeltmesi (`<html>`/`<body>` kırpıcı sayılmaz); hız düğmesi menü açar (0,5×–3×, tekerlekle adım). Tek ortak zamanlayıcı (`src/modules/instagram/scheduler.ts`), oynatırken kare başı hesap yok.
- **Video İndirici (YouTube):** boyutlar sayfadaki oynatıcı verisinden anında (`yt-main.ts`, MAIN dünyası); oynatma listesi indirme (tümü veya «Videoları seç…» ile seçilenler, onay kutuları + alt çubuk, Shift ile aralık); düğme «Tümünü oynat» satırının altında, bulunamazsa sol altta yüzer; gizli liste uyarısı; MP3 en yüksek VBR (`--audio-quality 0`); durum etiketi yalnızca o sayfanın indirmesini gösterir; masaüstü yalnızca süren iş varken ve sekme görünürken sorgulanır.
- **Döviz Çevirici (yeni modül `currency`):** ECB kuru (api.frankfurter.dev, 6 saat önbellek); Steam'in tüm mağaza sayfalarında fiyatlar Steam'in kendi kutusunda TL (tıklayınca o sayfada dolar); tüm sitelerde üstüne gelince/seçince TL ipucu (varsayılan kapalı, tüm site izni ister); «5 Mark», «5 euro», «10 dolar» gibi yazılar (DM sabit kur 1,95583); SlapMemo baloncuğunda seçili fiyatın TL'si.
- **Performans:** iki bağımsız inceleme turu yapıldı, bulunan 20 sorunun hepsi düzeltildi (sonsuz rAF döngüleri, saniyelik native host çağrısı, kapalıyken dinleyiciler, Steam tam sayfa taramaları).
- **Diğer:** worker.ts bozuk yorum, `db.rs` → `db/` alt modülleri, `panel.ts` → `src/panel/sections/`, eski dallar silindi, eski notlar `../arsiv/`.

## 2. Sıradaki adımlar

1. Actions'taki `v0.5.5` yayınının başarılı olduğunu, Releases'te yükleyici, `.sig`, `latest.json` ve eklenti ZIP'i olduğunu kontrol et.
2. 0.5.5'i kur, eklentiyi `%LOCALAPPDATA%\LifeTools\extension` klasöründen yükle; sonra küçük bir 0.5.6 yayınlayıp masaüstü ve eklenti otomatik güncellemesini gerçekten dene.
3. Kullanıcı testleri: YouTube liste seçerek indirme, Steam ana sayfa TL, Instagram ana sayfa/Keşfet, popup ses kartı.
4. U4 (masaüstünde Notlar, Görevler, İzleme listesi) ve U5 (CC0 ortam sesleri; önce aday listesi, kullanıcı onayı) bekliyor.
5. İsteğe bağlı: hafif takip engelleme modülü (önerildi, kullanıcı «her neyse» dedi), SmartScreen için kod imzalama.

## 3. Nasıl çalıştırılır

- **Eklenti:** `npm install` → `npm run build` → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`. Değişiklikten sonra `npm run build` + eklentide ↻.
- **Masaüstü:** `cd desktop` → `npm install` → `npm run tauri dev`. Testler: `cd desktop/src-tauri && cargo test`. Yükleyici: `npm run tauri build` (önce kökte `npm run build`, çünkü `dist/` yükleyiciye `extension/` olarak gömülür).
- **Yayın:** tüm sürüm dosyalarını yükselt (aşağıda), commit, `git tag vX.Y.Z` + `git push origin vX.Y.Z`. `.github/workflows/release.yml` sürüm uyuşmazsa durur; derler, imzalar, `latest.json` ve `LifeTools-extension-X.Y.Z.zip` yükler. README'de «Sürüm yayınlama ve otomatik güncelleme» bölümü var.
- **Sürüm dosyaları:** `package.json`, `package-lock.json` (2 yer), `src/manifest.json`, `desktop/package.json`, `desktop/package-lock.json` (2 yer), `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`, `Cargo.lock` (`lifetools-desktop` girdisi). Küçük yama adımları (0.5.5 → 0.5.6).

## 4. Bilinmesi gerekenler (tuzaklar)

- **Anahtarlar `%USERPROFILE%\.lifetools-keys\`:** `ext-key.pem` (eklenti kimliği), `updater.key` + `updater.key.password` (güncelleme imzası). **Silme, depoya koyma, yedeğini al** — `updater.key` kaybolursa kurulu uygulamalara bir daha güncelleme gönderilemez. GitHub sırları: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (eklendi).
- **Eklenti kimliği sabit:** `laejkffjeefcodgkhkgppbfimbkoppih` (`src/manifest.key.txt`, açık anahtar).
- **Tauri 2.11'e sabit:** `tauri 2.11.6`, `tauri-runtime 2.11.3`, `tauri-runtime-wry 2.11.4`, `tauri-macros/codegen 2.6.3`. `cargo update` çalıştırma. Güncelleyici `tauri-plugin-updater = "=2.12.0"` (2.13+ Tauri 2.12 ister). Yeni crate eklerken önce crates.io'da `tauri` gereksinimine bak, sonra sabit sürümle `cargo add`, ardından kilitli sürümlerin değişmediğini kontrol et.
- **BOM yok:** `tauri.conf.json`'a BOM girerse okunamaz.
- **YouTube Trusted Types:** YouTube sayfasında `innerHTML` atamak yasak; içerik betiklerinde DOM öğeleri oluştur.
- **YouTube DOM (2026):** oynatma listesi başlığı `yt-page-header-view-model` + `yt-flexible-actions-view-model` (sınıflar `ytFlexibleActionsViewModelAction` gibi bitişik). Satırlar oturum açıkken `ytd-playlist-video-renderer`, açık değilken `yt-lockup-view-model`. Gizli ana sayfa `ytd-browse` da DOM'da kalır; her zaman görünür olanı seç. Oturum açmamış tarayıcıda gizli listeler görünmez.
- **Steam DOM:** klasik fiyatlar `.discount_final_price`/`.discount_original_price`/`.game_purchase_price` (+ `data-price-final` kuruş); React bölümleri karışık sınıf adları kullanır → içinde yalnız fiyat yazan yaprak öğeler bulunur (`isStandalonePriceText`). Döngü koruması yalnızca fiyat öğesinin kendisine bakmalı (kapsayıcıya bakınca tüm bölümler kilitlenmişti).
- **Native host:** `sendNativeMessage` her çağrıda yeni işlem başlatır; zamanlayıcıyla sık çağırma.
- **Sayfa betiklerinde performans:** `getComputedStyle`/`elementsFromPoint`/tam sayfa `querySelectorAll` işlerini kare başına, fare hareketinde veya her MutationObserver kaydında yapma; rAF ile birleştir, kapalıyken dinleyicileri kaldır.
- **Arka plan sunucuları `dist/` içinde çalışmasın:** `npm run build` `dist/`'i silerken EBUSY verir. Demo/test sunucularını kopya klasörden aç.
- **Delegeler:** `cargo` çalıştıramaz; doğrulayıcı `~/.cargo/bin`'i PATH'e eklemeli; komutlarda `!` yerine bash betiği; Windows Python'u `/c/...` yollarını açamaz (`cygpath -w` kullan). Terra bazen işi yarım bırakır → bağlantı kontrolleri koy. Türkçe karakter bozulması taraması: `grep -E "[a-zA-Zçğışöü]\?[a-zA-Zçğışöü]"` (`\x3f` ile yazılmış `?` normaldir).
- **Masaüstünde yazarken genişletme bilerek yok** (küresel klavye kancası riski).

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
| Ctrl+Alt+T (masaüstü) | Etkin pencereyi üstte tut |

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
