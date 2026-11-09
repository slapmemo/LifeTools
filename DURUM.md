# LifeTools — Kaldığımız Yer

> Son güncelleme: 10 Kasım 2026 · sürüm 0.5.2 · dal master
> Yeni bir sohbete/oturuma başlarken önce bu dosyayı, sonra iki planı oku:
> `../LifeTools_Plan_v3_2026-11-06.md` (özellik yol haritası) ve `../LifeTools_Arayuz_Plani_2026-11-06.md` (arayüz düzenlemesi).

## 1. Durum özeti

LifeTools GitHub'da herkese açık; README klasörleri, özellikleri, Releases veya kaynaktan kurulumu, ilk kurulum sonrası adımları ve gizliliği anlatıyor. Masaüstü README'si de güncellendi. Projeye bilerek lisans eklenmedi.

| Alan | Durum |
|---|---|
| Eklenti ve masaüstü | U1–U3 tamamlandı; eklenti ve masaüstü Native Messaging ile bağlı. |
| Varsayılanlar | Yeni kurulumda tüm modüller ve özellikler açık; otomatik sekme uyutma kapalı, isteğe bağlı site izni gerektiren özellikler izin verilince çalışır. Masaüstünde «yalnızca panoya kopyala» kapalıdır. |
| Testler | Eklenti: 51 test dosyası, ~200 test (vitest); masaüstü 62 test (cargo test). |
| Sürümler | Eklenti ve masaüstü aynı sürümü kullanır: 0.5.2. X indirmesi tek tıkla en yüksek kalite, Panel'de «Kalite sor» ve İndirilenler alt klasörü ayarı var. Popup, Panel, masaüstü Ayarlar ve tepsi sürümü gösterir; eski masaüstü için uyarı vardır. |
| Dağıtım | v0.4.0, v0.5.0, v0.5.1 ve v0.5.2 Releases yayımlandı; her birinde eklenti ZIP'i ve kullanıcı başına NSIS yükleyicisi bulunur. |

Instagram Reels hız kontrolü (0,5×–3×, fare videodayken < / >, hız hatırlanır) ve sekme başına Ses Yükseltici (%0–600) eklendi. Ses Yükseltici tabCapture ve offscreen AudioContext kullanır; Chrome sekme paylaşımı göstergesini gösterir, chrome:// sayfalarında çalışmaz. LifeBrowser'ın otomatik aynı-site gruplaması kaldırıldı; elle «Siteye göre grupla» duruyor.

Video İndirici YouTube ve Shorts'ta başlık altındaki «↓ İndir» menüsünden tüm kaliteleri, tahmini boyutları ve MP3'ü sunar; klasör seçilir ve son klasör hatırlanır. Satır içi ilerleme, iptal ve tamamlandı durumu vardır. Diğer sitelerde sağ tık veya Komut Merkezi'ndeki «video indir» kullanılır; Panel › Video İndirici iş geçmişini, iptali ve araç durumunu gösterir. Masaüstü ilk kullanımda yt-dlp ve ffmpeg'i SHA-256 doğrulamasıyla `%APPDATA%\\LifeTools\\tools` altına indirir; işler gizli çalışır ve native host kapansa da sürer. Bağımsız güvenlik incelemesinde sorun bulunmadı.

Masaüstü genel kısayolları Ayarlar › Kısayollar'dan değiştirilebilir: pano seçici Ctrl+Alt+V, şablonlar Ctrl+Shift+Space, üstte tut Ctrl+Alt+T. Eski pano kısayolu Ctrl+Shift+V terminallerde yapıştırmayı bozuyordu. Desteklenmeyen komutlarda masaüstünü güncelleme mesajı gösterilir.

Yeni LT ve yaprak logosunun kaynakları `design/logo/`, eklenti simgeleri `src/icons/`, masaüstü simgesi `desktop/src-tauri/icons/icon.ico` içindedir. Derleme simgeleri `src/icons/` içinden alır. Sürüm artışları küçük yama adımlarıyla yapılır; `package.json`, `src/manifest.json`, `desktop/package.json`, `desktop/src-tauri/tauri.conf.json`, `Cargo.toml` ve kilit dosyaları birlikte güncellenir.

Masaüstü yükleyicisi `npm run tauri build` ile `LifeTools_<sürüm>_x64-setup.exe` olarak üretilir. Release ZIP'i Python `zipfile` ile hazırlanmalı: PowerShell Compress-Archive ters eğik çizgili yollar üretip başka makinelerde «Could not load icon» hatasına yol açtı; v0.4.0 ve v0.5.0 ZIP'leri yeniden paketlendi. İş akışı: özellik dalı, yerel kullanıcı testi, ardından birleştirme ve push. Commit öncesi Türkçe karakter bozulmalarını tara.

## 2. Sıradaki adımlar

1. YouTube dışı sitelerde video indirmeyi, klasör seçicinin Chrome arkasında açılıp açılmadığını, Ses Yükseltici'yi ve Reels hızını yerel olarak dene; geri bildirimleri düzelt.
2. U4: masaüstüne Notlar, Görevler ve İzleme listesi ekle.
3. U5: CC0 ortam sesleri için önce aday listesi hazırla; kullanıcı dinleyip onayladıktan sonra uygula.
4. Seçim baloncuğunu daha az rahatsız edici yapmayı değerlendir: gecikme, Ctrl veya en az seçim uzunluğu.
5. Eski v0.4.0 sürümünün silinmesini ve SmartScreen uyarısı için yükleyicinin kod imzalanmasını değerlendir.

### Geçmiş

- **9 Kasım:** Instagram video indirme ve ilerleme çubuğu eklendi; çubuk üst katmana taşındı. İleri sarma yerel Chrome'da denenecekti. Seçim baloncuğunda × yalnızca kapatır; site gizleme ⋯ menüsündedir ve geri alınabilir.
- **8 Kasım:** K1–K6, Sekme Yöneticisi, grup gizleme ve Sade tasarım uygulandı. Çalışma alanları sonradan kaldırıldı; kayıtlı alanlar oturumlara taşındı. Geri dönüş etiketleri `before-workspaces` ve `before-redesign`. Baloncuk çeviri, arama, harita ve tarihli görev; kısa link çözme; X çoklu video ve GIF indirme; not hatırlatma, sayfa kopyası ve ekran görüntüsü; otomatik ve masaüstü yedek eklendi.
- **7 Kasım:** U3 masaüstü kabuğu, Pano, Şablonlar, ortam sesi, Piller, Pencereler, Elektrik, Ayarlar ve Ana sayfa tamamlandı. U4 ve U5 bekliyor.

## 3. Nasıl çalıştırılır

- **Eklenti:** `npm install` → `npm run build` → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`. Değişiklikten sonra `npm run build` + eklentide ↻.
- **Masaüstü:** yeni terminal → `cd desktop` → `npm install` → `npm run tauri dev`. Testler: `cd desktop/src-tauri && cargo test`.
- **Bağlantı:** masaüstü Ayarlar › "Chrome eklentisini bağla" → eklenti Panel › Ayarlar › Depolama › "Verileri masaüstüne taşı".

## 4. Bilinmesi gerekenler (tuzaklar)

- **Eklenti kimliği sabit:** `laejkffjeefcodgkhkgppbfimbkoppih`. Açık anahtar `src/manifest.key.txt` (depoda, gizli değil); `build.mjs` onu `dist/manifest.json`'a yazar. Özel anahtar `%USERPROFILE%\.lifetools-keys\ext-key.pem` — **silme, depoya koyma.**
- **Tauri 2.11'e sabit:** `Cargo.lock` içinde `tauri-runtime 2.11.3`, `tauri-runtime-wry 2.11.4`, `tauri-macros/codegen 2.6.3`. 2.12 runtime geriye uyumsuz; `cargo update` çalıştırma. npm tarafı `@tauri-apps/api 2.11.1`, `@tauri-apps/cli 2.11.5`.
- **Tauri CLI** `npm run tauri dev` sırasında `Cargo.toml`'u kendi biçimine çevirebilir (`tauri-build = { version = "2", features = [] }`). Zararsız.
- **BOM yok:** Rust/JSON dosyalarına UTF-8 BOM girerse `tauri.conf.json` okunamaz. Delegelere her görevde "UTF-8 without BOM" yaz.
- **Delegeler `cargo` çalıştıramaz** (sandbox). Rust hataları doğrulayıcıdan sonra yöneticiye düşer; doğrulayıcı betiği `~/.cargo/bin`'i PATH'e eklemeli.
- **Doğrulama komutlarında `!` kullanma** — doğrulayıcı `cmd.exe` ile çalışıyor. Koşulları bir bash betiğine koy (`bash script.sh`).
- **Yeni migrasyon eklerken:** eski migrasyonlara dokunma; yeni tablolar `src/core/backup.ts` yedeğine eklenmeli. Şema sahibi eklentidir; masaüstü kendi sürümünü `desktop_schema_version` anahtarında tutar.
- **Codex Terra bazen "geçti" deyip işi yarım bırakıyor** (yalnız yardımcı dosya yazıp hiçbir şeyi bağlamadı). Doğrulamaya bağlantı (wiring) kontrolleri koy: modül `src/modules/index.ts`'te mi, manifest/`build.mjs` güncel mi.
- **Codex Terra Türkçe karakterleri bozabiliyor** (ç/ğ/ı/ş/ö/ü → `?`, U3.2'de oldu). Doğrulamaya `grep -E "[a-zA-Zçğışöü]\?[a-zA-Zçğışöü]"` kontrolü koy.
- **Masaüstünde yazarken genişletme bilerek yok** (küresel klavye kancası = keylogger riski). Yerine Ctrl+Shift+Space şablon seçici.

## 5. Kısayollar (varsayılan)

| Tuş | İşlem |
|---|---|
| Alt+S | Seçimi (yoksa sayfayı) SlapMemo'ya kaydet |
| Alt+Q | Görsel sekme değiştirici |
| Alt+K | Komut Merkezi |
| Alt+P | Resim içinde resim |
| Ctrl+Alt+V (masaüstü, Ayarlar'dan değiştirilebilir) | Pano geçmişi seçici |
| Ctrl+Shift+Space (masaüstü) | Şablon seçici |
| Ctrl+Alt+T (masaüstü) | Etkin pencereyi üstte tut |

## 6. Commit geçmişi (özet)

| Commit | İçerik |
|---|---|
| `1dc39f1` | v0.1 iskelet, X engelleyici, SlapMemo |
| `ebcf0d5` … `24363a7` | Link Temizleyici, Smart Replies, Görevler, Süre Takibi, JSON yedek |
| `09f64b6` … `fa9c666` | v0.2 sekme araçları, Command Center, Kısayollar, Araç Çubuğu |
| `44e69d0`, `e72a163` | v0.3 İzleme Listesi, PiP, Pano Yuvaları, X Video |
| `a101a27` … `2e02b4c` | v0.4 masaüstü + Native Messaging köprüsü |
| `2f626fc`, `2b20287`, `91b7e7e` | Arayüz U1, U2a, U2b |
| `4c4c300` | X video buton/menü düzeltmesi |
| `380b70a` … `9ef2b8e` | "Sade" yeni tasarım (etiket `before-redesign`) |
| `033535b` | Çalışma alanları kaldırıldı (göç: oturumlara) |
| `fc6d69d` … `0528533` | Kısa link, baloncuk düğmeleri, not hatırlatma, X Hepsini indir + GIF, otomatik yedek, sayfa kopyası/ekran görüntüsü notu, masaüstü yedek |
| `218fa98` … `7ea597a` | Yedek geri yükleme düzeltmesi, Google çeviri, baloncuk × düzeltmesi |
| `da340d9` … `1e3578a` | Instagram indir + ilerleme çubuğu |
