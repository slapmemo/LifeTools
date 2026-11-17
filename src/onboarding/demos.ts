/**
 * Özellik rehberindeki döngülü mini animasyonlar. Yalnızca CSS ile oynar (demos.css), işaretleme sabittir;
 * kullanıcı verisi içermez. Düğme adları gerçek arayüzle aynı tutulur. Hareket azaltma açıksa her animasyon
 * döngünün %75'inde (sonuç karesinde) durur.
 */
type Demo = { label: string; html: string };

const POINTER = '<svg class="demo-pointer" viewBox="0 0 16 22" aria-hidden="true"><path d="M1 1v17l4.5-4.2 3 6.7 3-1.4-3-6.6H15z"/></svg>';
const bar = (url: string) => `<div class="demo-bar"><i></i><i></i><i></i><span class="demo-url">${url}</span></div>`;
const toast = (title: string, detail = '', icon = '✓') =>
  `<div class="demo-toast"><span class="demo-check">${icon}</span><span><b>${title}</b>${detail ? `<small>${detail}</small>` : ''}</span></div>`;
const caret = '<span class="demo-caret"></span>';
// Masaüstü animasyonları için: arka plandaki pencere, küçük seçici pencere ve basılan tuşlar.
const win = (title: string) => `<div class="dk-win"><div class="dk-title"><i></i>${title}</div></div>`;
const miniHead = (glyph: string, title: string) => `<div class="dk-mini-head"><span>${glyph}</span>${title}</div>`;
const miniFoot = (items: [string, string][]) => `<div class="dk-mini-foot">${items.map(([k, t]) => `<kbd>${k}</kbd> ${t}`).join(' · ')}</div>`;
const keys = (cls: string, names: string[]) => `<div class="dk-keys ${cls}">${names.map(n => `<kbd>${n}</kbd>`).join('<span>+</span>')}</div>`;

export const DEMOS: Readonly<Record<string, Demo>> = {
  slapmemo: {
    label: 'Animasyon: bir sayfada cümle seçilir, altında LifeTools baloncuğu çıkar, "Not" düğmesine basılır, "Not kaydedildi" bildirimi çıkar.',
    html: `${bar('ornek-site.com/makale')}
      <div class="demo-page">
        <span class="demo-line" style="width:72%"></span>
        <p class="demo-text"><span class="demo-sel" data-aim="sel">Su en yoğun hâline 4 °C'de ulaşır.${caret}</span></p>
        <span class="demo-line" style="width:88%"></span>
        <span class="demo-line" style="width:54%"></span>
      </div>
      <div class="demo-pill"><span class="demo-btn primary" data-aim="btn">📝 Not</span><span class="demo-btn">🔎 Ara</span><span class="demo-btn">🌐 Çevir</span><span class="demo-btn">⋯</span><span class="demo-btn muted">×</span></div>
      ${POINTER}${toast('Not kaydedildi', 'Panel › Notlar')}`,
  },
  'link-cleaner': {
    label: 'Animasyon: takip ekleri olan bir bağlantı seçilir, baloncukta "Temiz link"e basılır, ?utm_source gibi ekler silinir ve temiz bağlantı kopyalanır.',
    html: `${bar('forum.ornek.com/konu')}
      <div class="demo-page">
        <span class="demo-line" style="width:64%"></span>
        <p class="demo-text demo-mono"><span class="demo-sel" data-aim="sel"><span>magaza.com/urun/42</span><span class="lc-junk">?utm_source=x&amp;fbclid=Ab3</span>${caret}</span></p>
        <span class="demo-line" style="width:80%"></span>
        <span class="demo-line" style="width:46%"></span>
      </div>
      <div class="demo-pill"><span class="demo-btn primary">📝 Not</span><span class="demo-btn lc-target" data-aim="btn">🔗 Temiz link</span><span class="demo-btn">🌐 Çevir</span><span class="demo-btn">⋯</span><span class="demo-btn muted">×</span></div>
      ${POINTER}${toast('Temiz link kopyalandı', 'magaza.com/urun/42')}`,
  },
  'tab-manager': {
    label: 'Animasyon: Sekme Yöneticisi\'nde iki YouTube sekmesi işaretlenir, "Yeni gruba al" ile gruplanır, "Kaydet ve kapat" ile kayıtlı gruplara taşınır.',
    html: `<div class="tm-toolbar"><b>Sekme Yöneticisi</b><span class="demo-btn soft tm-new" data-aim="new">Yeni gruba al</span><span class="demo-btn soft tm-save" data-aim="save">Kaydet ve kapat</span></div>
      <div class="tm-frame"><span class="tm-chip">Dersler</span></div>
      <div class="tm-row tm-r1"><span class="tm-box" data-aim="c1"></span><span class="fav" style="--c:#e33">▶</span>YouTube · Türev dersi 1</div>
      <div class="tm-row tm-r2"><span class="tm-box" data-aim="c2"></span><span class="fav" style="--c:#e33">▶</span>YouTube · Türev dersi 2</div>
      <div class="tm-rest">
        <div class="tm-row"><span class="tm-box off"></span><span class="fav" style="--c:#888">W</span>Vikipedi · Türev</div>
        <div class="tm-row"><span class="tm-box off"></span><span class="fav" style="--c:#2a7">✉</span>Gelen kutusu</div>
      </div>
      <div class="tm-saved"><span class="muted">Kayıtlı gruplar</span><span class="tm-chip">📁 Dersler · 2 sekme</span></div>
      ${POINTER}`,
  },
  'tab-manager-drag': {
    label: 'Animasyon: Sekme Yöneticisi\'nde açık bir sekme tutulup Kayıtlı gruplar\'daki "Okunacaklar" grubuna sürüklenir; sekme oraya kaydedilip kapanır, "Geri al" seçeneği çıkar.',
    html: `<div class="tmd-head"><b>Sekme Yöneticisi</b></div>
      <div class="tmd-win"><div class="tmd-label">Pencere 1</div>
        <div class="tmd-row"><span class="fav" style="--c:#e33">▶</span>YouTube · Ders 1</div>
        <div class="tmd-row tmd-grab" data-aim="grab"><span class="fav" style="--c:#5b8def">M</span>Makale: Uzay</div>
        <div class="tmd-row"><span class="fav" style="--c:#888">W</span>Vikipedi · Türev</div>
      </div>
      <div class="tmd-saved"><div class="tmd-label">Kayıtlı gruplar</div>
        <div class="tmd-card" data-aim="drop"><div class="tmd-card-head">📁 Okunacaklar <span class="tmd-count"><span class="tmd-c1">2</span><span class="tmd-c2">3</span></span></div>
          <div class="tmd-mini tmd-new"><span class="fav" style="--c:#5b8def">M</span>Makale: Uzay</div>
          <div class="tmd-mini"><span class="fav" style="--c:#2a7">B</span>Blog yazısı</div>
          <div class="tmd-mini"><span class="fav" style="--c:#d9a400">T</span>Tarif</div>
        </div>
      </div>
      <div class="tmd-clone"><span class="fav" style="--c:#5b8def">M</span>Makale: Uzay</div>
      ${POINTER}
      <div class="tmd-toast">1 sekme “Okunacaklar” grubuna eklendi <b>Geri al</b></div>`,
  },
  'life-browser': {
    label: 'Animasyon: Sekme Yöneticisi\'nde gruba ad yazılır, "Kaydet ve sekmeleri kapat"a basılır, penceredeki sekmeler kapanıp tek bir kayıtlı grup olur; "Geri al" ile geri açılabilir.',
    html: `<div class="lb-tabs">${['Makale', 'PDF', 'Video', 'Notlar', 'Harita'].map((t, i) => `<span class="lb-tab" style="--i:${i}"><i style="--c:${['#5b8def', '#e55', '#e33', '#d9a400', '#2a7'][i]}"></i>${t}</span>`).join('')}</div>
      <div class="lb-card">
        <div class="lb-form"><span class="lb-input"><span class="lb-ph">Grup adı…</span><span class="lb-typed">Tez araştırması</span></span><span class="demo-btn primary">Pencereyi kaydet</span><span class="demo-btn soft lb-save" data-aim="save">Kaydet ve sekmeleri kapat</span></div>
        <div class="lb-auto"><span>Pencere kapanınca otomatik kaydet</span><span class="lb-switch"></span></div>
      </div>
      ${POINTER}${toast('5 sekme kaydedildi', 'Tez araştırması · Geri al')}`,
  },
  'time-tracker': {
    label: 'Animasyon: Bugün kartında sitelerdeki süreler dolar; x.com için konulan 30 dakikalık limitin %80\'i dolunca uyarı çıkar.',
    html: `<div class="tt-card">
        <div class="tt-head"><b>Bugün</b><span class="tt-total">1 sa 22 dk</span></div>
        ${[['youtube.com', '#e33', '▶', '58 dk', 1], ['github.com', '#555', '◆', '34 dk', .59], ['x.com', 'var(--text)', '𝕏', '24 dk', .8]].map(([d, c, f, t, w], i) =>
          `<div class="tt-row tt-r${i}"><span class="fav" style="--c:${c}">${f}</span><span class="tt-domain">${d}</span><span class="tt-bar"><i style="--w:${w}"></i>${i === 2 ? '<em class="tt-limit"></em>' : ''}</span><span class="tt-time">${t}</span></div>`).join('')}
      </div>
      ${toast('x.com: limitin %80\'i doldu', '', '!')}`,
  },
  'volume-booster': {
    label: 'Animasyon: açılır penceredeki "Bu sekmenin sesi" kartında 400% düğmesine basılır, ses çubuğu ve videonun ses dalgaları büyür.',
    html: `${bar('video-sitesi.com/izle')}
      <div class="vb-video"><span class="vb-speaker">🔊</span><span class="vb-eq">${'<i></i>'.repeat(7)}</span></div>
      <div class="vb-card">
        <div class="vb-head"><span>Bu sekmenin sesi</span><span class="vb-value"><span class="vb-from">100%</span><span class="vb-to">400%</span></span></div>
        <div class="vb-slider"><i class="vb-fill"></i><i class="vb-thumb"></i></div>
        <div class="vb-presets"><span class="demo-btn soft">100%</span><span class="demo-btn soft">200%</span><span class="demo-btn soft vb-400" data-aim="btn">400%</span><span class="demo-btn soft">Sıfırla</span></div>
      </div>
      ${POINTER}`,
  },
  pip: {
    label: 'Animasyon: videonun üstüne gelince sağ üstte ⧉ düğmesi çıkar, basılınca video köşede küçük pencerede oynamaya devam eder.',
    html: `${bar('video-sitesi.com/izle')}
      <div class="pip-place">Resim içinde resim olarak oynatılıyor</div>
      <div class="pip-text"><span class="demo-line" style="width:90%"></span><span class="demo-line" style="width:70%"></span><span class="demo-line" style="width:84%"></span><span class="demo-line" style="width:50%"></span></div>
      <div class="pip-video"><span class="pip-play">▶</span><span class="pip-progress"><i></i></span><span class="pip-btn" data-aim="btn">⧉</span></div>
      ${POINTER}`,
  },
  'video-downloader': {
    label: 'Animasyon: YouTube\'da videonun altındaki "İndir" düğmesine basılır, menüden 720p seçilir, indirme ilerleyip biter.',
    html: `${bar('youtube.com/watch?v=…')}
      <div class="vd-thumb"><span class="pip-play">▶</span></div>
      <div class="vd-info">
        <b>Türev nedir? · Ders 4</b>
        <div class="vd-row"><span class="vd-avatar"></span><span class="demo-line" style="width:56px"></span><span class="vd-pill vd-sub">Abone ol</span><span class="vd-pill vd-dl" data-aim="dl">↓ İndir</span></div>
      </div>
      <div class="vd-menu"><span>En iyi kalite</span><span class="vd-720" data-aim="opt">720p</span><span>Sadece ses (MP3)</span></div>
      ${POINTER}
      <div class="demo-toast vd-job"><span class="demo-check vd-icon"><span class="vd-down">↓</span><span class="vd-ok">✓</span></span><span><b><span class="vd-running">İndiriliyor · 720p</span><span class="vd-done">İndirildi · 720p</span></b><span class="vd-progress"><i></i></span></span></div>`,
  },
  'x-video': {
    label: 'Animasyon: X\'te videolu bir gönderinin altındaki indirme simgesine basılır, simge onay işaretine döner ve video indirilir.',
    html: `${bar('x.com/ornek/status/…')}<span class="xv-dlicon">${'<svg viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>'}</span>
      <div class="xv-file"><b>video.mp4</b><small>4,2 MB · Tamamlandı</small></div>
      <span class="xv-avatar"></span>
      <div class="xv-head"><b>Örnek Hesap</b><span class="muted">@ornek · 2 sa</span></div>
      <div class="xv-video"><span class="pip-play">▶</span></div>
      <div class="xv-actions"><span>💬 12</span><span>↻ 3</span><span>♡ 48</span><span>📊 1,2 B</span>
        <span class="xv-wrap"><span class="xv-btn" data-aim="dl"><svg class="xv-arrow" viewBox="0 0 24 24"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg><svg class="xv-ok" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span><span class="xv-caret">▾</span></span></div>
      ${POINTER}`,
  },
  instagram: {
    label: 'Animasyon: Instagram videosunun köşesindeki hız düğmesinden 2× seçilir, video hızlanır; ardından ↓ düğmesiyle video indirilir.',
    html: `${bar('instagram.com/reel/…')}
      <div class="ig-video">
        <span class="pip-play">▶</span>
        <div class="ig-ctrl"><span class="ig-dl" data-aim="dl">↓</span><span class="ig-speed" data-aim="speed"><span class="ig-s1">1×</span><span class="ig-s2">2×</span></span></div>
        <div class="ig-seek"><span class="ig-time">0:12 / 0:30</span><span class="ig-rail"><i></i></span></div>
      </div>
      <div class="ig-menu"><span><b>1× (normal)</b></span><span>1,5×</span><span class="ig-two" data-aim="two">2×</span></div>
      <div class="ig-feedback"><span class="ig-f1">İndiriliyor…</span><span class="ig-f2">İndirildi ✓</span></div>
      <div class="ig-side"><span class="xv-avatar"></span><span class="demo-line" style="width:60%"></span><span class="demo-line" style="width:85%"></span><span class="demo-line" style="width:70%"></span><span class="demo-line" style="width:45%"></span></div>
      ${POINTER}`,
  },
  currency: {
    label: 'Animasyon: Steam\'de oyun fiyatları dolar yerine TL olarak görünür; fiyatın üstüne gelince asıl fiyat ve kur yazar.',
    html: `${bar('store.steampowered.com')}
      ${[['Uzay Madencisi', '#3d6fb4', '', '$19.99', '839,58 ₺'], ['Kale Savunması', '#9a5b2e', '-50%', '$9.99', '419,58 ₺'], ['Gece Treni', '#5a3d8a', '', '$59.99', '2.519,58 ₺']].map(([name, color, off, usd, tl], i) =>
        `<div class="cu-row cu-r${i}"><span class="cu-cover" style="--c:${color}"></span><span class="cu-name">${name}</span>${off ? `<span class="cu-off">${off}</span>` : ''}<span class="cu-price"${i === 2 ? ' data-aim="p3"' : ''}><span class="cu-usd">${usd}</span><span class="cu-tl">${tl}</span></span></div>`).join('')}
      <div class="cu-tip">Orijinal: $59.99 · 1 $ = 42,00 ₺ · ECB</div>
      ${POINTER}`,
  },

  // ---------- Masaüstü uygulaması (desktop/src/views/hosgeldin.ts) ----------
  'desktop-notlar': {
    label: 'Animasyon: Ctrl+Alt+N ile hızlı not penceresi açılır, not yazılır, Ctrl+Enter ile kaydedilir ve Notlar listesinin en üstüne eklenir.',
    html: `${win('LifeTools — Notlar')}
      <div class="dk-list dn-list">
        <div class="dk-row dn-new">📝 Pazartesi: faturayı öde</div>
        <div class="dk-row dn-old">📝 Kitap önerileri</div>
        <div class="dk-row dn-old">📝 Market listesi</div>
      </div>
      <div class="dk-mini dn-mini">${miniHead('✎', 'Hızlı not')}<div class="dk-mini-body"><span class="dk-typed dn-typed">Pazartesi: faturayı öde</span></div>${miniFoot([['Ctrl+Enter', 'kaydet'], ['Esc', 'kapat']])}</div>
      ${keys('dn-k1', ['Ctrl', 'Alt', 'N'])}${keys('dn-k2', ['Ctrl', 'Enter'])}`,
  },
  'desktop-izleme': {
    label: 'Animasyon: İzleme listesine "Interstellar" yazılıp Enter\'a basılır, en üste İzlenecek olarak eklenir; durumuna tıklanınca İzleniyor olur.',
    html: `${win('LifeTools — İzleme listesi')}
      <div class="dz-input"><span class="dz-ph">Ne izleyeceksin? (Enter: ekle)</span><span class="dk-typed dz-typed">Interstellar</span></div>
      <div class="dk-list dz-list">
        <div class="dk-row dz-new">🎬 Interstellar <span class="muted">· Film</span><span class="dz-chip" data-aim="chip"><span class="dz-s1">İzlenecek</span><span class="dz-s2">İzleniyor</span></span></div>
        <div class="dk-row dz-old">📺 The Bear <span class="muted">· Dizi</span><span class="dz-chip on">İzleniyor</span></div>
        <div class="dk-row dz-old">🎬 Dune <span class="muted">· Film</span><span class="dz-chip">İzlenecek</span></div>
      </div>
      ${keys('dz-k1', ['Enter'])}${POINTER}`,
  },
  'desktop-sablonlar': {
    label: 'Animasyon: e-posta yazarken Ctrl+Shift+Space ile şablon seçici açılır, /imza seçilip Enter\'a basılır, imza metni yazının sonuna eklenir.',
    html: `${win('E-posta — Yeni ileti')}
      <div class="dk-doc ds-doc"><span class="muted">Kime: ali@ornek.com</span><span>Merhaba Ali, raporu ekte gönderiyorum.</span><span class="dk-typed ds-ins">Saygılarımla, Ayşe Yılmaz</span></div>
      <div class="dk-mini ds-mini">${miniHead('💬', 'Metin şablonları')}
        <div class="dk-mini-row sel"><b>/imza</b><span class="muted">Saygılarımla, Ayşe…</span></div>
        <div class="dk-mini-row"><b>/adres</b><span class="muted">Atatürk Cad. No: 5…</span></div>
        <div class="dk-mini-row"><b>/iban</b><span class="muted">TR12 0006 4000…</span></div>
        ${miniFoot([['↑↓', 'seç'], ['Enter', 'ekle'], ['Esc', 'kapat']])}</div>
      ${keys('ds-k1', ['Ctrl', 'Shift', 'Space'])}${keys('ds-k2', ['Enter'])}`,
  },
  'desktop-pano': {
    label: 'Animasyon: Ctrl+Alt+V ile pano geçmişi açılır, birkaç dakika önce kopyalanan bağlantı seçilip Enter\'a basılır, bağlantı yazının içine yapıştırılır.',
    html: `${win('Not Defteri')}
      <div class="dk-doc dp-doc"><span>Rapor bağlantısı: <span class="dk-typed dp-ins">https://ornek.com/rapor</span></span><span class="muted">Toplantı perşembe.</span></div>
      <div class="dk-mini dp-mini">${miniHead('📋', 'Pano geçmişi')}
        <div class="dp-rows"><i class="dp-hl"></i>
          <div class="dk-mini-row">📄 Toplantı 14:30'da</div>
          <div class="dk-mini-row">🔗 https://ornek.com/rapor</div>
          <div class="dk-mini-row">📄 Teşekkürler!</div></div>
        ${miniFoot([['↑↓', 'seç'], ['Enter', 'kopyala'], ['Esc', 'kapat']])}</div>
      ${keys('dp-k1', ['Ctrl', 'Alt', 'V'])}${keys('dp-k2', ['↓'])}${keys('dp-k3', ['Enter'])}`,
  },
  'desktop-ortam': {
    label: 'Animasyon: Ortam sesinde Yağmur ve Fan açılır, oynat düğmesine basılır, sesler çalmaya başlar.',
    html: `${win('LifeTools — Ortam sesi')}
      <div class="do-list">
        ${[['🌧', 'Yağmur', 'rain', 70], ['🌀', 'Fan', 'fan', 45], ['🟫', 'Kahverengi gürültü', 'brown', 30]].map(([emoji, name, id, vol]) =>
          `<div class="do-row do-${id}"><span>${emoji} ${name}</span><span class="do-slider"><i style="width:${vol}%"></i></span><span class="do-switch"${id !== 'brown' ? ` data-aim="${id}"` : ''}></span></div>`).join('')}
      </div>
      <div class="do-play"><span class="do-btn" data-aim="play"><span class="do-i1">▶</span><span class="do-i2">❚❚</span></span><span class="do-label"><span class="do-l1">Çalmıyor · 2 ses hazır</span><span class="do-l2">Çalıyor · 2 etkin ses</span></span><span class="vb-eq do-eq">${'<i></i>'.repeat(6)}</span></div>
      ${POINTER}`,
  },
  'desktop-piller': {
    label: 'Animasyon: kablosuz farenin pili %24\'ten %19\'a iner, çubuk kırmızıya döner ve "Pil azaldı" bildirimi gelir.',
    html: `${win('LifeTools — Cihaz pilleri')}
      <div class="dl-cards">
        <div class="dl-card dl-mouse"><div class="dl-head"><span><b>Kablosuz fare</b><small>Fare · 2.4 GHz alıcı</small></span><span class="dl-pct"><span class="dl-p1">%24</span><span class="dl-p2">%19</span></span></div><span class="dl-bar"><i></i></span></div>
        <div class="dl-card"><div class="dl-head"><span><b>Kulaklık</b><small>Kulaklık · Bluetooth</small></span><span class="dl-pct">%70</span></div><span class="dl-bar dl-full"><i></i></span></div>
      </div>
      <div class="dl-toast"><span class="dl-app">LT</span><span><b>LifeTools</b><small>Pil azaldı: Kablosuz fare %19</small></span></div>`,
  },
};

/** Birden çok animasyonu olan modüller. Pencere Kaydetme 0.8.0'da Sekme Yöneticisi'ne katıldı; animasyonu da orada. */
const MODULE_DEMOS: Readonly<Record<string, readonly string[]>> = { 'tab-manager': ['tab-manager', 'tab-manager-drag', 'life-browser'] };

/** Bir modülün rehber kartında gösterilecek animasyonlar (yoksa boş). */
export function featureDemos(moduleId: string): HTMLElement[] {
  return (MODULE_DEMOS[moduleId] ?? [moduleId]).map(buildDemo).filter((box): box is HTMLElement => box !== null);
}

/** Masaüstü rehberindeki özelliğin animasyonu (kimlik: desktop-features.ts). */
export function desktopDemo(featureId: string): HTMLElement | null {
  return buildDemo(`desktop-${featureId}`);
}

function buildDemo(demoId: string): HTMLElement | null {
  const demo = DEMOS[demoId];
  if (!demo) return null;
  const box = document.createElement('div');
  box.className = `demo demo-${demoId}`;
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', demo.label);
  box.innerHTML = demo.html;
  new ResizeObserver(() => aim(box)).observe(box);
  return box;
}

/** İmlecin gideceği noktalar: data-aim="ad" olan öğe için --ad-x / --ad-y (öğenin içinde, metni örtmeyen sağ alt bölge).
 * offset* kullanılır; dönüşümler (animasyondaki kaymalar) ölçümü bozmaz. Seçim için sağ ucu alınır.
 * Bazı animasyonlar satır yüksekliğini de oynattığı için ölçüm, animasyonlar kapalıyken (başlangıç yerleşiminde) yapılır. */
function aim(box: HTMLElement): void {
  box.classList.add('demo-measuring');
  for (const node of Array.from(box.querySelectorAll<HTMLElement>('[data-aim]'))) {
    let x = 0, y = 0;
    for (let el: HTMLElement | null = node; el && el !== box; el = el.offsetParent as HTMLElement | null) { x += el.offsetLeft; y += el.offsetTop; }
    const sel = node.classList.contains('demo-sel');
    box.style.setProperty(`--${node.dataset.aim}-x`, `${Math.round(x + node.offsetWidth * (sel ? 1 : .62))}px`);
    box.style.setProperty(`--${node.dataset.aim}-y`, `${Math.round(y + node.offsetHeight * (sel ? .3 : .6))}px`);
  }
  box.classList.remove('demo-measuring');
}
