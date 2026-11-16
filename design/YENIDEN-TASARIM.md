# LifeTools yeniden tasarım — ilerleme notu

Kaldığımız yerden devam etmek için. Son güncelleme: 2026-11-17.

## Kaynak

- Tasarımcının paketi: `C:\Users\slapm\Downloads\LifeTools_Design_Handoff_v1.zip` ve iki önizleme görseli (`LifeTools_Handoff_Dark_Preview.png`, `..._Light_Preview.png`).
- Paketteki fikir görselleri (ChatGPT ile üretilmiş) yalnızca fikir veriyor; kesin değerler paketteki `tokens.css`, `specs.md` ve `colors.json` dosyalarında.
- Paket kendi değişken adlarını kullanıyor (`--space-4` = 16px, `--radius-md` vb.). **Paketi olduğu gibi kopyalama.** Bizim adlarımız korunuyor (`--space-4` = 4px, `--radius-8` …); yalnızca değerler aktarıldı.

## Kararlar

- Masaüstü menüsü değişmiyor: Ana sayfa, Notlar, İzleme listesi, Şablonlar, Pano, Ortam sesi, Diğer → Piller, Ayarlar.
- Görsellerdeki "Odak", "Medya", "Sekmeler", "Metin" menüleri **eklentiye** ait (eklenti tasarımı ayrı iş).
- Pencere başlık çubuğu Windows'un kendisi kalıyor (özel başlık çubuğu yok).
- Ana sayfadaki "Hızlı araçlar" kutusu yok (menüyle aynı işi görüyor).
- Site logoları (YouTube, X …) uygulamaya gömülmeyecek; gerekirse Chrome favicon'u kullanılacak.
- Ölçüler: gövde 14px, sayfa başlığı 24px/650, karşılama 28px, kart radius 12, menü satırı 40px, menü 216px (dar: 64px), ikon çizgisi 1.8.

## Yapılanlar

### Ortak (masaüstü + eklenti)
- `design/tokens.css`: yeni açık/koyu renkler; `--font-size-14/16/24/28`, `--space-32`, `--control-h` eklendi. Eklenti de bu dosyayı kullanıyor → eklenti renkleri de değişti (düzeni değişmedi).
- `design/icons.ts`: çizgi kalınlığı 1.8; yeni ikonlar `clock-3`, `monitor`, `audio-lines`, `play`, `pause`, `arrow-right`.
- `design/assets/`: dalga SVG'leri (`backgrounds/`), boş durum çizimleri (`empty-states/`, renkler `currentColor`'a çevrildi), tepsi ikonları (`tray/`, henüz bağlanmadı).

### Masaüstü
- `desktop/src-tauri/tauri.conf.json`: tüm pencerelerin `backgroundColor` değeri `#10111a`.
- `desktop/src/style.css`: kabuk (menü, logo, dalgalar, başlık ölçüleri), ana sayfa stilleri (`.stat-*`, `.panel-*`), `.page-header/.page-eyebrow/.page-title/.page-subtitle` ortak sayfa başlığı sınıfları, `.empty-art`.
- `desktop/src/app.ts`: menü başında temaya göre açık/koyu logo.
- `desktop/src/views/anasayfa.ts`: yeni ana sayfa (selamlama + 4 özet kartı + Son notlar / Son kopyalananlar).
- `desktop/src-tauri/src/db/dashboard.rs` + `api.ts`: özete `sites_total_seconds` ve pano `created_at` eklendi.
- `desktop/src/view-components.ts`: `emptyState(başlık, ipucu, çizim?)`; çizim: `notes`, `clipboard`, `watchlist`.
- `desktop/src/vite-env.d.ts`: `?raw` / `?url` importları için.
- `desktop/.claude/launch.json`: önizleme için Vite sunucusu (`desktop-ui`, port 1420).

### Aynı oturumda düzeltilen hatalar
- İlk açılışta ana sayfa "state not managed" hatası (state artık Builder'da kayıtlı).
- Kısayol, açılış sırasında basılırsa uygulama çökebiliyordu (`ActiveShortcuts` erken kayıt).
- Ana sayfa ve Piller açılınca pencere ~1 sn donuyordu (pil okuma artık arka planda).

## Sıradaki işler

1. Sayfaları tek tek yeni düzene geçir (her sayfaya `.page-header` + yeni kart/satır görünümü):
   - [x] Ana sayfa
   - [x] Notlar (başlık + arama Ctrl+K + "Yeni not", hap şeklinde kategori sekmeleri, notlar ayrı kartlar)
   - [x] İzleme listesi (Notlar ile aynı düzen; satır başında tür ikonu)
   - [x] Şablonlar (ana sayfa bölümü; küçük seçici pencere hâlâ eski)
   - [x] Pano (duraklat/devam, kırmızı "Tümünü temizle", uyarı şeridi, satırda sabitle düğmesi)
   - [x] Ortam sesi (çalar kartı + ön ayarlar kartı yan yana, kanal başına ikon; yeni ikonlar `cloud-rain`, `fan`, `waves`)
   - [x] Piller (yuvarlak çubuk, büyük yüzde, %20 altı kırmızı, Yenile okurken devre dışı; yeni ikon `refresh-cw`)
   - [x] Ayarlar (ikonlu bölüm kartları, onay kutuları → anahtar, tema hap seçici, sürüm başlık altında; tema değişince pencere arka planı da yeni renklere göre)
2. [x] Küçük pencereler: pano seçici, şablon seçici, hızlı not, bildirim (toast). Ortak `miniHeader` / `miniFooter` (`view-components.ts`), stiller `style.css` → "Küçük pencereler". Tarayıcıda pano seçici ve hızlı not kontrol edildi; şablon seçici ve toast aynı stilleri kullanıyor ama ayrıca bakılmadı.
3. [x] Tepsi ikonu: `main.rs` → `sync_tray_icon` görev çubuğu temasını (`SystemUsesLightTheme`) okuyup `icons/tray-on-dark-32.png` / `tray-on-light-32.png` seçiyor; açılışta ve ~20 sn'de bir denetliyor. Tauri'ye `image-png` özelliği eklendi. Gerçek uygulamada görülmedi.
3b. [x] Ana sayfadaki "En çok ziyaret edilen" kartında site ikonu: eklenti `site_icons` tablosuna (migrasyon 12) Chrome'un favicon önbelleğinden 32 px ikon yazıyor (`time-tracker/background.ts` → `captureIcon`, haftada bir yenilenir, ağ isteği yok); masaüstü `dashboard.rs` okuyor, yalnızca `data:image/` kabul ediyor. Eklentinin yeni sürümü Chrome'a gelene kadar (sürüm artışı + yayın) kartta eski ekran ikonu görünür.
4. Chrome eklentisi tasarımı:
   - [x] Popup (`src/popup/`): ikonlu kart başlıkları (`data-icon` yer tutucuları `popup.ts` içinde Lucide ile doluyor), ses ön ayarlarında seçili olan vurgulu, "Bugün" kartı = toplam + favicon'lu ilk 3 site, alt kısımda Notlar / Sekmeler / Sekme Yöneticisi kutuları, altta sürüm.
   - [x] Panel kabuğu (`src/panel/panel.css` sonundaki "Yeni tasarım" bölümü): 216px menü + dalgalar (`build.mjs` artık `design/assets/backgrounds`'u `dist/assets/` içine kopyalıyor), seçili menü çerçevesi, üst çubuk kaldırıldı, sürüm etiketi gerçek sürümü gösteriyor (eskiden sabit "v0.1").
   - [x] Panel bölümleri gözden geçirildi (Metin, Sekmeler, Odak, Medya, Ayarlar zaten yeni stile uyuyordu). Eklenenler: arama kutularına ikon, Süreler listesinde site ikonları + vurgu renginde çubuklar, Medya'da tüm genişliğe yayılan tek düğmeler düzeltildi.
   - [x] Sekme Yöneticisi sayfası (`src/modules/tab-manager/tabs.html` + `tabs.css` sonundaki "Yeni tasarım"): ikonlu başlık + alt yazı, sayaç hapı, tam genişlik arama, seçim çubuğunda kırmızı "Kapat", yuvarlak grup kartları, dalga. Davranış değişmedi (yalnızca id'ler kullanılıyor).
   - [ ] Mockup'taki site filtresi hapları (Tümü 14 · YouTube 7 · X 2 · Diğer 5) yeni özellik; yapılmadı.
   - [ ] Diğer eklenti sayfaları (sekme değiştirici, komut merkezi, hoş geldin, engel sayfası) yalnızca renkleri aldı.
   - Önizleme: masaüstü Vite sunucusu açıkken `http://localhost:1420/@fs/<proje>/dist/popup.html` (veya `panel.html`) açılıp sahte `window.chrome` konuyor, sonra `import('./popup.js?mock=…')`.
5. Gerçek uygulamada (Tauri build) deneme. Şimdiye kadar yalnızca tarayıcıda sahte veriyle bakıldı.

## Sayfalarda tekrar kullanılacak sınıflar (`desktop/src/style.css`)

- `.page-header.page-header-row` → solda başlık, sağda `.page-actions` (arama + birincil düğme).
- `.page-title.page-title-icon` → ikonlu sayfa başlığı; `.page-subtitle` → alt yazı.
- `.search-field` → ikonlu arama kutusu (`label` içinde ikon + `input`).
- `.chip-tabs` → hap şeklinde sekmeler; sayı için içine `.tab-count`. Sekmeler + sağdaki süzgeç için satır: `.toolbar.notes-tabs`.
- `.note-add` + `.note-add-input` → ikonlu ekleme kartı.
- `.note-list` → her satırı (`.list-row`) ayrı kart olarak gösteren liste.
- `.panel-row-icon` → satır başındaki yuvarlak köşeli ikon kutusu.
- `.danger-button` → kırmızı çerçeveli tehlikeli işlem düğmesi; `.warning-banner` → sarı uyarı şeridi.

## Önizleme nasıl yapılıyor

Tarayıcıda Tauri yok; `desktop-ui` sunucusu açılıp sayfaya sahte `window.__TAURI_INTERNALS__` (invoke → sabit veri, `metadata.currentWindow.label = 'main'`) konuyor, sonra `import('/src/main.ts?mock=…')` ile uygulama yeniden yükleniyor.

Dikkat: Claude'un Edit aracı yeni metnin sonundaki boşluğu siliyor; `icons.ts` gibi dizelerde sonu boşlukla biten değiştirme yapma.

Dikkat: proje OneDrive içinde olduğu için Vite bazen dosya değişikliğini kaçırıyor ve eski CSS'i veriyor. Değişiklik görünmüyorsa önizleme sunucusunu durdurup yeniden başlat.

## Kontroller

```bash
cd desktop && npx tsc --noEmit && npx vite build
```

```bash
npx vitest run
```

```bash
cd desktop/src-tauri && cargo test
```
