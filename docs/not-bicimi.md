# Not biçimi

Notların veritabanında nasıl saklandığı. Çizici (`shared/notes/render.ts`), düzenleyici (`shared/notes/editor.ts`) ve dışa aktarma bu belgeye göre çalışır; örneklerin hepsi `tests/shared-notes.test.ts` içinde gidiş-dönüş olarak sınanır (Markdown -> düzenleyici belgesi -> Markdown aynı çıkar).

Kayıt biçimi **Markdown**'dır: CommonMark'ın bildiğimiz kısmı, GFM'den üstü çizili / tablo / yapılacak / ayırıcı ve birkaç LifeTools eki. Ek işaretleri dışa aktarılan `.md` dosyasında düz yazı gibi görünür; hiçbir şey kaybolmaz.

## Genel kurallar

- Metin UTF-8; satır sonu `\n` (`\r\n` okurken `\n` olur).
- Paragraf içinde tek satır sonu **satır sonu** (`<br>`) olarak çizilir (CommonMark'taki gibi boşluğa çevrilmez). Eski düz notlar böyle yazıldığı için.
- Boş satır paragrafı ayırır. **Boş satır kuralı:** ardışık N boş satır görünür N satırlık boşluk bırakır; yani paragraf arası 1 boş satır, her ek boş satır bir boş paragraf (en çok 3 boş satır; fazlası 3'e iner). Baştaki ve sondaki boş satırlar yok sayılır. Kod bloğunun içindeki boş satırlara dokunulmaz.
- Değiştirilmemiş not düzenleyicide açılıp kapanınca **yeniden yazılmaz**; özgün metin aynen döner. Yeniden yazma yalnız kullanıcı bir şey değiştirince olur ve aşağıdaki "kurallı biçime" yazar.
- HTML yorumlanmaz; `<b>` düz yazıdır.
- #etiket düz metindir (biçim değildir): boşluktan ya da `(`'den sonra gelen `#sözcük`. Satır başındaki `# ` başlıktır.

## CommonMark / GFM kısmı

| Yapı | Yazım |
|---|---|
| Başlık | `# `, `## `, `### ` ... `###### ` |
| Kalın / eğik | `**kalın**`, `*eğik*` (okurken `_eğik_` ve `__kalın__` de anlaşılır) |
| Üstü çizili | `~~metin~~` |
| Satır içi kod | `` `kod` `` |
| Kod bloğu | ```` ```dil ```` ... ```` ``` ```` |
| Madde listesi | `- madde` (okurken `*` ve `+` de) |
| Numaralı liste | `1. bir` |
| Yapılacak | `- [ ] iş`, `- [x] bitti` |
| Alıntı | `> alıntı` |
| Ayırıcı | `---` |
| Bağlantı | `[yazı](https://adres)`; çıplak `https://adres` de bağlantı olur |
| Tablo | `\| a \| b \|` + `\| --- \| --- \|` + satırlar |

Kapalı (kasıtlı) olanlar: girintili kod bloğu, `Başlık\n---` biçiminde başlık, bağlantı tanımları (`[a]: url`), HTML, `&amp;` çözümlemesi. Eski notlarda bunlar düz yazı olarak kalır.

## LifeTools ekleri

| Ek | Yazım | Not |
|---|---|---|
| Altı çizili | `++metin++` | Açılıştan önce harf/rakam, kapanıştan sonra harf/rakam olmaz (`i++; j++` bozulmaz). |
| Vurgu | `==metin==` | Aynı kural. `a == b` vurgu değildir (boşlukla başlar). |
| Yazı rengi | `{kırmızı\|metin}` | Sabit palet: `kırmızı`, `mavi`, `yeşil`, `turuncu`, `mor`, `gri`. Ad olarak saklanır; temaya göre boyanır. İç içe biçim alabilir: `{mavi\|**kalın**}`. Palette olmayan ad düz yazıdır. |
| Not bağlantısı | `[[Başlık]](lt-note:42)` | Başlık yalnız görüntü içindir, kimlik (42) asıldır. |
| Görsel | `![](lt-img:7)`, `![](lt-img:7 =320)` | `=320` piksel genişliği. Şimdilik yalnız ayrıştırılır/yazılır; çizicide `[görsel]` yer tutucusu görünür. |

İşaretler iç içe girebilir; yazarken kurallı sıra: renk en dıştadır (`{mavi|**kalın**}`), diğer işaretlerin sırası TipTap şemasına göre belirlenir.

## Örnekler (testlerde aynen kullanılır)

```
Bu **kalın** bir söz
Bu *eğik* bir söz
Bu ~~silindi~~ artık
Bu ++önemli++ bir söz
Bu ==vurgulu== bir söz
Durum: {kırmızı|acil} ve {yeşil|tamam}
{mavi|**kalın mavi**} yazı
Bu ***ikisi birden*** olsun
Komut `npm test` çalışsın
Bkz [[Alışveriş listesi]](lt-note:42) notu
Resim ![](lt-img:7 =320) burada
```

```
- [ ] süt al
- [x] ekmek al
```

```
- üst
  - alt bir
  - alt iki
- ikinci üst
```

```
| Ad | Yaş |
| --- | --- |
| Ayşe | 30 |
| Can | 25 |
```

Boş satır kuralı (`A`, 2 ve 3 boş satır, `B`):

```
A


B
```

## Kurallı biçime yazma (kullanıcı değiştirince)

Düzenleyici bir notu yeniden yazdığında şunu üretir: `*eğik*`, `**kalın**`, `- ` madde, `1. ` numaralı, tablo hücreleri `| a | b |` (tek boşluk, ayırıcı `---`), madde listeleri sıkı (maddeler arasında boş satır yok), kod çiti ```` ``` ````. Düz metindeki özel işaretler gerektiğinde `\` ile kaçırılır (`\*`, `\[`, satır başında `\#`, `\-`, `1\.`); `_` kelime içinde, `~`/`+`/`=` tek başına, `{` palet adı ve `|` dışında kaçırılmaz.

## Bilinen kayıplar (gidiş-dönüşte aynı çıkmayanlar)

Yalnız not **değiştirilirse** ortaya çıkar (değişmeyen not özgün metniyle döner):

1. `_eğik_`, `__kalın__`, `* madde`, `+ madde`, `1) madde` kurallı biçime (`*eğik*`, `**kalın**`, `- `, `1. `) döner.
2. Gevşek liste (maddeler arası boş satır) sıkı listeye döner. Yapılacak ile düz madde karışık bir listede iki ayrı liste olur ve aralarına boş satır girer.
3. Ardışık 4+ boş satır 3 boş satıra iner; baştaki/sondaki boş satırlar silinir. Girintili satırların girintisi kaybolur.
4. Tabloda hizalama (`:---`, `---:`) ve sütun genişliği korunmaz; hücrede satır sonu ve birden çok paragraf tek satıra birleşir; ilk satırdan fazla hücre atılır, eksik hücre boş eklenir. Tablonun ilk satırı her zaman başlık satırıdır.
5. Satır içi kod başka işaretle birleşmez (`` **`kod`** `` yalnız `` `kod` `` olur): TipTap `code` işareti diğerlerini dışlar.
6. Dış görsel `![a](https://...)` desteklenmez, düz yazı olarak (kaçışlı) kalır.
7. Satır sonundaki iki boşluk (sert satır sonu) tek satır sonuna iner (zaten aynı çizilir).
8. Bağlantı başlığı (`[a](url "başlık")`) korunur; `<https://a.com>` çıplak adrese döner.
9. Aynı türden iç içe `++a ++b++ c++` desteklenmez.

## Ekrana bağlama (düzenleyici arayüzü)

- Salt okunur ekranlar `shared/notes/render.ts`'i kullanır (TipTap'siz). Yazmaya başlanınca `import { loadNoteEditorUI } from '../../shared/notes/lazy'` ile `const { mountNoteEditor, NoteConflictError } = await loadNoteEditorUI()`; TipTap ayrı parçada (chunk) yüklenir.
- Stil: `shared/notes/notes.css` hem çizici (`.md-*`) hem düzenleyici içindir; ekran bir kez yükler. Renkler `design/tokens.css` değişkenlerinden ve dosyanın başındaki `--note-*` (açık/koyu) değişkenlerinden gelir.
- `mountNoteEditor(container, { markdown, placeholder, onChange, onSave, autosave, draftKey, compact, onConflict, onFocusMode })` bir `NoteEditorHandle` döner: `editor, getMarkdown, isDirty, focus, destroy, setStatus, flush, clearDraft, setMarkdown, setFocusMode, isFocusMode`.
- Otomatik kaydetme: son değişiklikten 1,5 sn sonra `onSave(markdown, { force })`. `NoteConflictError` fırlatılırsa "Bu not başka yerde değişti" çubuğu çıkar; "Yeniden yükle" `onConflict('reload')` çağırır (ev sahibi `handle.setMarkdown` ile yeni metni verir), "Benimkini kaydet" `onConflict('overwrite')` sonra `onSave(md, { force: true })` çağırır. Ev sahibi kapanmadan `await handle.flush()` çağırmalı.
- Taslak: `draftKey` verilirse kaydedilmemiş metin localStorage'da tutulur; yalnız `markdown` boşsa geri yüklenir (`isDirty()` true döner). Not eklenince `clearDraft()`.
- Kısayollar: Ctrl+B/I/U/K, Ctrl+F (bul), Ctrl+H (değiştir), Esc (bul çubuğu, biçim boyacısı, odak modu).
