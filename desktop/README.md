# LifeTools masaüstü

Windows için Tauri 2 ve TypeScript uygulaması. Veriler `%APPDATA%\LifeTools\lifetools.db` içindeki yerel SQLite veritabanında tutulur.

## Kurulum

Releases sayfasından `LifeTools_<version>_x64-setup.exe` dosyasını indirip çalıştır. Kurulum kullanıcı hesabına yapılır ve yönetici yetkisi gerektirmez. İmzalanmamış yükleyici için SmartScreen uyarısı çıkarsa **Daha fazla bilgi → Yine de çalıştır** seçeneğini kullan. Uygulama gizli başlar; bildirim alanındaki simgeden açılır.

## Geliştirme

Rust stable (MSVC), Visual Studio C++ Build Tools, WebView2 ve Node.js gerekir. Depo kökünden:

```sh
cd desktop
npm install
npm run tauri dev
```

Uygulama gizli başlar; bildirim alanındaki simgeden açılır. Pencereyi kapatmak tepsiye gizler, tamamen çıkmak için tepsi menüsündeki **Çıkış** kullanılır.

```sh
npm run build
npm run typecheck
cd src-tauri
cargo test
```

`npm run build` arayüzü `desktop/dist/` içine derler. `npm run tauri build` yükleyiciyi `src-tauri/target/release/bundle/nsis/` içinde oluşturur.

## Özellikler

- **Ana sayfa:** Özetleri ve bölümlere hızlı erişimi gösterir.
- **Pano geçmişi:** Metinleri ara, sabitle, sil veya kaydı duraklat. `Ctrl+Alt+V` seçicisi bir metni panoya kopyalar; otomatik yapıştırmaz.
- **Pencereler:** `Ctrl+Alt+T` veya tepsi menüsü etkin pencereyi üstte tutar ya da bırakır. Pencereler bölümünden listeyi yönetebilirsin.
- **Şablonlar:** Şablonları oluştur ve ara; `Ctrl+Shift+Space` seçicisinde Enter ile önceki pencereye yapıştır. Ayarlar'da yalnızca panoya kopyalama seçilebilir; yazarken otomatik genişletme yoktur.
- **Elektrik tahmini:** Güç, günlük kullanım ve birim fiyattan tahmini tüketim ve maliyeti hesapla.
- **Piller:** Windows'un bildirdiği sistem ve Bluetooth pil düzeylerini gör; düşük pil bildirimini Ayarlar'dan yönet.
- **Ortam sesi:** Cihazda üretilen sesleri karıştır, zamanlayıcı ve ön ayar kullan; tepsi menüsünden oynatmayı kontrol et.
- **Ayarlar:** Tema, Windows başlangıcı, pano saklama süresi ve sınırı, hariç tutulan uygulamalar, şablon modu ve bildirimleri düzenle. Buradan yedek indirebilir ve Chrome bağlantısını yönetebilirsin.

## Chrome bağlantısı

Masaüstünde **Ayarlar → Chrome eklentisini bağla → Bağla** ile Native Messaging bağlantısını kur. Ardından eklenti Paneli'nde **Depolama → Verileri masaüstüne taşı** işlemini kullan; şablonlar dahil taşınan veriler ortak veritabanında kullanılabilir. Uygulamanın yürütülebilir dosyasını taşırsan bağlantıyı yeniden kur. Tarayıcı depolamasına dönüş de Panel'den yapılabilir.

## Gizlilik

Uygulama telemetri göndermez. Pano geçmişi yerel veritabanında şifrelenmeden tutulur; kaydı duraklatabilir veya uygulamaları Ayarlar'dan hariç tutabilirsin. Gizlilik için işaretlenmiş pano içerikleri kaydedilmez. Şablon yapıştırırken önceki pano içeriği yalnızca metinse geri yüklenebilir.
