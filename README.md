# LifeTools — v0.1 iskeleti

Chrome (Manifest V3) eklentisi. Yalnızca Chrome hedeflenir. Ağ isteği, uzaktan kod veya analitik yoktur.

## İçerik

- TypeScript (strict) + esbuild; çıktı `dist/` (paketlenmemiş eklenti).
- Modül sistemi (`src/modules/<id>/`): her araç `id`, Türkçe ad ve arka plan başlatıcısı tanımlar; açık/kapalı durumu `chrome.storage.local` içinde tutulur. Kapalı modülün dinleyicileri hiçbir şey yapmaz.
- Site engelleyici modülü: eski X sekme kapatma prototipinin (`legacy-x-prototype/`) TypeScript'e taşınmış hâli.
- SQLite katmanı (`src/db/`): resmî `@sqlite.org/sqlite-wasm`, OPFS (`opfs-sahpool`) üzerinde kalıcı; offscreen belgedeki Worker içinde çalışır. `exec` / `query` API'si, `meta` tablosunda `schema_version` ve migrasyon çalıştırıcısı.
- Popup: araç listesi (aç/kapat), site engelleyici paneli ve "Veritabanı durumu" satırı.

## SlapMemo (hızlı not)

Seçili metni, bağlantıyı veya sayfayı kategorili not olarak kaydeder (Notlar, Okunacaklar, İzlenecekler, Fikirler). Notlar yerel SQLite'ta tutulur; arama FTS5 ile, Türkçe karakterlere duyarsızdır (`calisma` → `çalışma`).

- **Sağ tık:** metin seç / bağlantıya veya sayfaya sağ tık → *SlapMemo'ya kaydet* → kategori.
- **Klavye:** `Alt+Shift+S` seçili metni "Notlar"a kaydeder (kısayol `chrome://extensions/shortcuts` içinden değiştirilebilir).
- **Popup:** hızlı not kutusu, kategori sekmeleri, arama, "notum" alanı ve silme.

Kayıt sonrası eklenti simgesinde kısa süre `✓` (kaydedildi), `=` (zaten kayıtlı) veya `!` (hata/boş seçim) görünür.

## Link Temizleyici

Sağ tık menüsünden bağlantının veya sayfanın temiz linkini kopyala.
Popup'ta etkin sayfanın ya da yapıştırdığın linkin temiz sürümünü gör ve kopyala.

## Akıllı Yanıtlar

Popup üzerinden `/iade` veya `;adres` gibi tetikleyicilerle Şablon ekleyebilir, arayabilir ve düzenleyebilirsin. Düzenlenebilir bir alanda sağ tık → **Şablon ekle** ile metni ekle. Yazarken genişletme için siteyi popup'ta ekleyip istenen site iznini ver; yeni açılan sayfada tetikleyicinin ardından Space veya Tab kullan. Metin yalnızca eklenir, gönderilmez.

## Hızlı Görevler

Popup'tan görev ve isteğe bağlı tarih ekle; açık görevleri tamamla, sil veya tamamlananları temizle. İstersen etkin sayfanın bağlantısını ekle. Sayfa, seçim veya bağlantı üzerinde sağ tık → **Görev olarak ekle** ile de kaydedebilirsin. Görevler yerel SQLite veritabanında saklanır.

## Web S?re Takibi

Odakl? Chrome penceresinin etkin sekmesinde, kullan?c? aktifken ge?irilen s?reyi bug?n veya son yedi g?n i?in g?sterir. Siteleri hari? tutabilir ve verileri silebilirsin. Yaln?zca alan ad? ve s?re yerel olarak saklan?r; ziyaret edilen sayfalar?n adresleri kaydedilmez ve a? iste?i yap?lmaz.

## Kurulum ve derleme

```
npm install
npm run build
```

## Eklentiyi yükleme

1. `chrome://extensions` adresini aç.
2. **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle** ile `dist/` klasörünü seç.

## Test

```
npm test          # birim testleri (vitest)
npm run typecheck # tür denetimi
```
