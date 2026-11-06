# X Sekme Koruması

Chrome veya Microsoft Edge'de seçtiğin X/Twitter profillerine gidildiğinde ilgili sekmeyi otomatik kapatan ücretsiz, yerel eklenti.

## Kurulum (Chrome)

1. ZIP dosyasını çıkart.
2. Chrome'da `chrome://extensions` sayfasını aç.
3. Sağ üstteki **Geliştirici modu** anahtarını aç.
4. **Paketlenmemiş öğe yükle**'ye tıkla.
5. ZIP'ten çıkan `X-Sekme-Koruma` klasörünü seç (içinde `manifest.json` olan klasör).
6. Araç çubuğundan eklentinin simgesini açıp engellemek istediğin `@kullaniciadi` veya `https://x.com/kullaniciadi` bağlantısını ekle.

Edge'de aynı adımları `edge://extensions` üzerinden izleyebilirsin.

## Ne yapar?

- Eklenti menüsünden kullanıcı adı veya profil bağlantısı ekler / siler.
- Engellemeyi tek anahtarla kapatıp açarsın; liste korunur.
- `x.com`, `twitter.com` ve `www` alt alanlarını destekler.
- Örneğin `@ornek`, `https://x.com/ornek` ve `https://x.com/ornek/status/123` aynı kullanıcı için engellenir.
- X içindeki sayfa yenilenmeden yapılan yönlendirmeleri de yakalar.
- Yeni bir engel eklediğinde mevcut açık sekmeleri de kontrol eder.
- Tüm liste sadece Chrome/Edge'in **yerel eklenti depolama alanında** tutulur. Sunucuya veri göndermez.

## Kapsam ve sınırlamalar

- Engelleme **kullanıcı adına** dayanır. Kullanıcı adını değiştiren hesaplar yeni adları eklenmedikçe engellenmez.
- `x.com/i/status/...` gibi kullanıcı adını URL'de içermeyen özel yönlendirme sayfaları kapsam dışıdır.
- Bu eklenti bir ebeveyn kontrolü veya aşılamaz kilit değildir: aç/kapa anahtarıyla kapatılabilir veya tarayıcıdan kaldırılabilir.
- Web gezinme API'si navigasyonu gözlemlediği için sayfa bazen çok kısa bir süre görünebilir; sekme daha sonra kapanır.
- Sadece X/Twitter URL'lerini değerlendirir; başka siteleri kapatmaz.

## Geliştirici notları

- Manifest V3; arka plan: `background.js` (service worker)
- URL/handle ayrıştırma: `shared/rules.mjs`
- Chrome storage erişimi: `shared/settings.mjs`
- Arayüz: `popup/`
- Harici kütüphane / sunucu / analitik / içerik betiği yoktur.
- Testler: Node.js yüklüyse klasörde `node --test tests/*.test.mjs` çalıştır.
