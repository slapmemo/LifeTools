# LifeTools — Kaldığımız Yer

> **Son güncelleme:** 8 Kasım 2026 · son commit `91b7e7e` (dal: `master`)
> Yeni bir sohbete/oturuma başlarken önce bu dosyayı, sonra iki planı oku:
> `../LifeTools_Plan_v3_2026-11-06.md` (özellik yol haritası) ve `../LifeTools_Arayuz_Plani_2026-11-06.md` (arayüz düzenlemesi).

## 1. Durum özeti

| Alan | Durum |
|---|---|
| Özellikler v0.1–v0.4 | **Yazıldı.** Eklentide 21 araç, masaüstünde 8 bölüm + eklenti köprüsü |
| Arayüz U1 (tasarım dili, sade popup, Panel iskeleti) | **Bitti** |
| Arayüz U2 (Panel kategorileri, tek kök sağ tık, kapalı araçlar gizli) | **Bitti** — Chrome'da henüz gözle kontrol edilmedi |
| Arayüz U3 (masaüstü tasarımı + Ana sayfa) | **Bitti** — gözle kontrol edilmedi |
| Arayüz U4 (masaüstünde notlar/görevler/izleme listesi) | Bekliyor |
| Arayüz U5 (gerçek CC0 ortam sesleri) | Bekliyor — önce aday listesi, kullanıcı dinleyip onaylayacak |
| Testler | Eklenti **123** (vitest), masaüstü **54** (cargo test) — hepsi geçiyor |

Kullanıcı eklentiyi Chrome'da denedi: popup çok karışıktı → U1/U2 bu yüzden yapıldı. X video indirme butonu kötü duruyordu → `4c4c300` ile düzeltildi (ikon + gölge-DOM menü); düzeltme X'te henüz denenmedi.

## 2. Sıradaki adımlar

> **8 Kasım:** Yeni yol haritası `../LifeTools_Ozellik_Rehberi_2026-11-08.md`. **K1–K6 hepsi yazıldı, Chrome'da denenmedi.** K1 SlapMemo (tek kat sağ tık, Alt+S, sayfa mesajı + Geri al, seçim baloncuğu) · K2 baloncukta Görev/İzle/Temiz link/Yuva · K3 sekme değiştirici merkez (Alt+Q, E/N/S, Grupla/Kopyalar/Oturum/Zombiler), etiket başlıkta, not sayfada · K4 Komut Merkezi (Alt+K, `görev … yarın`, izle, yuva, grupla, süre…), Alt+P · K5 YouTube/IMDb ＋ İzle, engel sayfası + X'te Engelle, videoda ⧉ · K6 otomatikler (hepsi varsayılan kapalı): link temizliği, otomatik grupla, kapanan pencereyi kaydet, zombileri uyut, görev hatırlatma, günlük süre limiti. **Sekme Yöneticisi** (`tabs.html`, OneTab tarzı): her pencerenin başında sabit sekme (varsayılan açık), seçip gruba al, grup adı/rengi, Kaydet ve kapat + Kaydedilenler; diğer araçlar bu iç sekmeyi `isInternalTabUrl` ile yok sayar. İçerik betikleri artık `iife` derleniyor (esm'de birbirini eziyordu). **Çalışma alanları** (Workona tarzı, varsayılan mod; Sekme Yöneticisi başlığından `Chrome grupları` moduna dönülebilir; tamamen geri almak için git etiketi `before-workspaces`). Motor bağımsız incelemeden geçti, 6 veri kaybı bulgusu düzeltildi. **Gizle** (Chrome'un kendi gizli grupları eklentiye görünmez; bu yüzden kendi gizlememiz): grup kartında `Gizle` → LifeBrowser oturumu olarak saklanır, en üstte **Gizlenen gruplar** kartları içindeki linklerle görünür (link tek tek açılır, `×` ile silinir, `Grubu aç` tümünü geri açar, `⋯`: Aç, listede kalsın / Yeniden adlandır / Sil). Komut Merkezi tema renklerine geçti (koyu temada beyaz satır hatası). IMDb/YouTube ＋ İzle varsayılan kapalı: panel → İzleme listesi → anahtar + izin. **Yeni tasarım "Sade"** (Arc/Linear tarzı: soğuk griler, tek indigo vurgu, ince çizgiler, solda simge menüsü): `design/tokens.css` + `components.css` (masaüstüyle ortak), panel, Sekme Yöneticisi, Alt+Q, Komut Merkezi, popup, engel sayfası, sayfa içi parçalar (`src/core/page-theme.ts`, `--lt-` değişkenleri). Geri almak için git etiketi `before-redesign`. Sıradaki: kullanıcı denemesi ve geri bildirim düzeltmeleri; sonra U4/U5 (masaüstü).

1. Kullanıcı U2'yi Chrome'da açık ve koyu temada dener; ekran görüntüsüyle geri bildirim verir.
2. Geri bildirim düzeltmeleri.
3. **U3** — masaüstü, küçük görevlere bölündü (kullanıcı tek büyük görevin yavaşlığından rahatsız oldu):
   - **U3.1** Kabuk: tasarım dili bağlanır, ikonlu kenar çubuğu + katlanabilir "Diğer" (Pencereler, Piller, Elektrik), tema seçimi, `app.ts` → `desktop/src/views/*.ts`. ✅ bitti
   - **U3.2** Pano + Şablonlar bölümleri ve Ctrl+Shift+V / Ctrl+Shift+Space seçicileri yeni bileşenlerle ✅ bitti
   - **U3.3** Ortam sesi (U5'e hazır kart düzeni), Piller, Pencereler, Elektrik, Ayarlar yeni bileşenlerle ✅ bitti
   - **U3.4** Ana sayfa kartları (Rust tarafında özet komutu) ✅ bitti
4. **U4**, **U5** (planın 5.3 ve 5.4 bölümleri).

## 3. Nasıl çalıştırılır

- **Eklenti:** `npm install` → `npm run build` → `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`. Değişiklikten sonra `npm run build` + eklentide ↻.
- **Masaüstü:** yeni terminal → `cd desktop` → `npm install` → `npm run tauri dev`. Testler: `cd desktop/src-tauri && cargo test`.
- **Bağlantı:** masaüstü Ayarlar › "Chrome eklentisini bağla" → eklenti Panel › Ayarlar › Depolama › "Verileri masaüstüne taşı".

## 4. Bilinmesi gerekenler (tuzaklar)

- **Eklenti kimliği sabit:** `laejkffjeefcodgkhkgppbfimbkoppih`. Açık anahtar `src/manifest.key.txt` (depoda, gizli değil); `build.mjs` onu `dist/manifest.json`'a yazar. Özel anahtar `C:\Users\slapm\.lifetools-keys\ext-key.pem` — **silme, depoya koyma.**
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
| Ctrl+Shift+V (masaüstü) | Pano geçmişi seçici |
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
