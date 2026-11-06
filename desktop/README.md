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
- **Ayarlar:** "Windows açılışında başlat" (varsayılan kapalı), saklama süresi, en fazla kayıt, hariç tutulan uygulamalar.

## Gizlilik notları

- Pano içeriğinde `ExcludeClipboardContentFromMonitorProcessing` biçimi varsa veya `CanIncludeInClipboardHistory = 0` ise kopya **kaydedilmez** (parola yöneticileri bunu işaretler).
- Pano sahibi uygulamanın exe adı hariç tutma listesindeyse kaydedilmez. Varsayılanlar: `KeePassXC.exe`, `KeePass.exe`, `1Password.exe`, `Bitwarden.exe`. Listeyi Ayarlar'dan düzenleyebilirsin.
- Gizlilik biçimleri okunamazsa (pano başka bir uygulamada kilitliyse) temkinli davranılıp o kopya kaydedilmez.
- **Duraklat** düğmesi tüm kaydı durdurur.
- Pano geçmişi yerel SQLite dosyasında **şifrelenmeden** saklanır. Bu dosyaya erişebilen biri kayıtlı metinleri okuyabilir; hassas verileri kopyalıyorsan hariç tutma listesini kullan veya duraklat.
- Elevated (yönetici) pencereler, yönetici olmayan LifeTools tarafından üstte tutulamaz.
