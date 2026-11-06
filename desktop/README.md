# LifeTools masaüstü (Windows 11)

Tauri 2 (Rust) + düz TypeScript (Vite) ile yazılmış yerel uygulama. Ağ isteği, telemetri veya uzaktan kod yoktur. Tüm veriler `%APPDATA%\LifeTools\lifetools.db` (SQLite) dosyasında tutulur. Uygulama kimliği: `com.mehmet.lifetools`.

## Geliştirme

Gereksinimler: Rust (stable, MSVC), VS Build Tools 2022, WebView2, Node 22.

```
cd desktop
npm install
npm run tauri dev      # uygulamayı geliştirme modunda çalıştırır
npm run build          # arayüzü derler (dist/)
npm run typecheck      # TypeScript tür denetimi
cd src-tauri
cargo test             # Rust birim testleri
```

Uygulama **gizli başlar**: pencere açılmaz, yalnızca bildirim alanında (tepsi) simge görünür. Simgeye tıkla veya sağ tıkla → "LifeTools'u aç". Pencereyi kapatmak onu tepsiye gizler; tamamen çıkmak için tepsi menüsünden "Çıkış" kullan. Aynı anda tek örnek çalışır; ikinci başlatma mevcut pencereyi açar.

## Özellikler

- **Tepsi menüsü:** LifeTools'u aç, Pano geçmişi, Etkin pencereyi üstte tut, Ayarlar, Çıkış.
- **Pano geçmişi:** Yalnızca metin (en fazla 10 000 karakter). `AddClipboardFormatListener` ile olay tabanlı dinlenir, yoklama yoktur. Art arda aynı kopya tek kayıt olur. Aranabilir liste; tıklayınca panoya geri kopyalanır (yeni kayıt oluşmaz), sabitle, sil, "Tümünü temizle" (iki tıklama; sabitlenenler korunur).
- **Ctrl+Shift+V:** imlecin yanında küçük bir seçici açar. Yön tuşları + Enter kopyalar ve kapatır; otomatik yapıştırmaz. Esc veya başka yere tıklamak kapatır.
- **Otomatik silme:** Sabitlenmemiş kayıtlar N günden (varsayılan 7) eskiyse açılışta ve saatte bir silinir. En fazla kayıt sayısı varsayılan 500'dür (sabitlenenler bu sınıra dahil değildir).
- **Üstte tut (Ctrl+Alt+T):** Etkin pencereyi her pencerenin üstünde tutar / bırakır. Masaüstü, görev çubuğu ve LifeTools yok sayılır. Üstte tutulanlar "Pencereler" bölümünde listelenir ("Kaldır", "Tümünü bırak"). Çıkışta hepsi bırakılır.
- **Elektrik tahmini:** Bileşen başına tahmini watt, günlük saat ve birim fiyat (TL/kWh) girilir; günlük/aylık(30 gün)/yıllık(365 gün) kWh ve TL gösterilir. Birim fiyat girilmeden TL hesaplanmaz. Sonuçlar yalnızca tahmindir; kesin değer için prize takılan watt ölçer gerekir.
- **Şablonlar (Ctrl+Shift+Space):** "Şablonlar" bölümünde tetikleyici (`/` veya `;` ile başlar, 1–31 harf/rakam/_/-), başlık ve metin tanımlanır; aranabilir (Türkçe duyarsız). Kısayol, imlecin yanında küçük bir seçici açar; Enter şablonu en son etkin olan pencereye yapıştırır: pano geçici olarak şablon metniyle değiştirilir, odak önceki pencereye döner, Ctrl+V gönderilir, ~400 ms sonra önceki pano metni geri konur. Enter/gönder tuşu **asla** gönderilmez. Bu geçici pano yazımları pano geçmişine kaydedilmez ve Windows pano geçmişi/bulutundan hariç işaretlenir. Yapıştırma sorunlu uygulamalar için Ayarlar'da **"Şablonu yalnızca panoya kopyala"** seçeneği vardır. Önceki pano yalnızca metinse geri yüklenir (resim/dosya panosu korunmaz). Yönetici yetkisinde çalışan pencerelere yapıştırılamaz (şablon panoda kalır).
  - **Gizlilik:** Genel klavye dinleyicisi (hook) yoktur; yazarken tetikleyiciyle otomatik metin genişletme **yapılmaz**. Şablonlar yalnızca kısayolla seçilir.
  - Tablo (`snippets`) uzantıdaki şemayla aynıdır; ileride eşitlenecek.
- **Piller:** Sistem pili (varsa, `GetSystemPowerStatus`) ve Bluetooth aygıtlarının Windows'un bildirdiği pil düzeyi (`{104EA319-6EE2-4701-BD47-8DDBF425BBE5},2` özelliği) listelenir. Yalnızca Windows'un verdiği değerler gösterilir, tahmin yapılmaz. Açılışta, bölüm açılınca ve 5 dakikada bir yenilenir; tepsi ipucunda da görünür. Bir aygıt %20 altına düştüğünde (düşüş başına bir kez; şarjdaki sistem pili hariç) küçük bir bildirim gösterilir — Ayarlar'dan kapatılabilir.
- **Ortam sesi:** Beyaz/pembe/kahverengi gürültü, yağmur, fan ve dalga sesleri Web Audio ile cihazda sentezlenir (ses dosyası yok). Kanal başına aç/kapa + ses, ana ses ve "x dk sonra kapat" zamanlayıcısı. Ön ayarlar kaydedilir/yüklenir/silinir. Tepsi menüsündeki **"Ortam sesi: Oynat/Durdur"** son kullanılan ayarı çalar/durdurur. Pencere tepsiye gizlense de ses sürer.
- **Ayarlar:** "Windows açılışında başlat" (varsayılan kapalı), saklama süresi, en fazla kayıt, hariç tutulan uygulamalar, şablon yapıştırma modu, düşük pil bildirimi.

## Gizlilik notları

- Pano içeriğinde `ExcludeClipboardContentFromMonitorProcessing` biçimi varsa veya `CanIncludeInClipboardHistory = 0` ise kopya **kaydedilmez** (parola yöneticileri bunu işaretler).
- Pano sahibi uygulamanın exe adı hariç tutma listesindeyse kaydedilmez. Varsayılanlar: `KeePassXC.exe`, `KeePass.exe`, `1Password.exe`, `Bitwarden.exe`. Listeyi Ayarlar'dan düzenleyebilirsin.
- Gizlilik biçimleri okunamazsa (pano başka bir uygulamada kilitliyse) temkinli davranılıp o kopya kaydedilmez.
- **Duraklat** düğmesi tüm kaydı durdurur.
- Pano geçmişi yerel SQLite dosyasında **şifrelenmeden** saklanır. Bu dosyaya erişebilen biri kayıtlı metinleri okuyabilir; hassas verileri kopyalıyorsan hariç tutma listesini kullan veya duraklat.
- Elevated (yönetici) pencereler, yönetici olmayan LifeTools tarafından üstte tutulamaz.
