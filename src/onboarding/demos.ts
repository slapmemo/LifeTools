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
  'life-browser': {
    label: 'Animasyon: gruba ad yazılır, "Kaydet ve kapat"a basılır, penceredeki tüm sekmeler kapanıp tek bir kayıtlı grup olur.',
    html: `<div class="lb-tabs">${['Makale', 'PDF', 'Video', 'Notlar', 'Harita'].map((t, i) => `<span class="lb-tab" style="--i:${i}"><i style="--c:${['#5b8def', '#e55', '#e33', '#d9a400', '#2a7'][i]}"></i>${t}</span>`).join('')}</div>
      <div class="lb-card">
        <div class="lb-form"><span class="lb-input"><span class="lb-ph">Grup adı…</span><span class="lb-typed">Tez araştırması</span></span><span class="demo-btn primary">Bu pencereyi kaydet</span><span class="demo-btn soft lb-save" data-aim="save">Kaydet ve kapat</span></div>
        <div class="lb-auto"><span>Pencere kapanınca sekmeleri otomatik kaydet</span><span class="lb-switch"></span></div>
      </div>
      ${POINTER}${toast('5 sekme kayıtlı gruba kaydedildi', 'Tez araştırması')}`,
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
};

/** Birden çok animasyonu olan modüller. Pencere Kaydetme 0.8.0'da Sekme Yöneticisi'ne katıldı; animasyonu da orada. */
const MODULE_DEMOS: Readonly<Record<string, readonly string[]>> = { 'tab-manager': ['tab-manager', 'life-browser'] };

/** Bir modülün rehber kartında gösterilecek animasyonlar (yoksa boş). */
export function featureDemos(moduleId: string): HTMLElement[] {
  return (MODULE_DEMOS[moduleId] ?? [moduleId]).map(buildDemo).filter((box): box is HTMLElement => box !== null);
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
 * offset* kullanılır; dönüşümler (animasyondaki kaymalar) ölçümü bozmaz. Seçim için sağ ucu alınır. */
function aim(box: HTMLElement): void {
  for (const node of box.querySelectorAll<HTMLElement>('[data-aim]')) {
    let x = 0, y = 0;
    for (let el: HTMLElement | null = node; el && el !== box; el = el.offsetParent as HTMLElement | null) { x += el.offsetLeft; y += el.offsetTop; }
    const sel = node.classList.contains('demo-sel');
    box.style.setProperty(`--${node.dataset.aim}-x`, `${Math.round(x + node.offsetWidth * (sel ? 1 : .62))}px`);
    box.style.setProperty(`--${node.dataset.aim}-y`, `${Math.round(y + node.offsetHeight * (sel ? .3 : .6))}px`);
  }
}
