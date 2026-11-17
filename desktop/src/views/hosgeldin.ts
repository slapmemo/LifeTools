import { getVersion } from '@tauri-apps/api/app';
import { icon, type IconName } from '../../../design/icons';
import { api, type Prefs } from '../api';
import { h } from '../dom';
import type { RouteId } from '../app';
import { isOn, setFeatures } from '../feature-state';
import { DESKTOP_FEATURES, type DesktopFeatureId } from '../../../src/core/desktop-features';
import { changesSince, featureBadges, whatsNewFrom, type ChangeKind } from '../../../src/core/whats-new';
import { desktopDemo } from '../../../src/onboarding/demos';
import '../../../src/onboarding/demos.css';

/**
 * Masaüstü özellik rehberi (eklentideki welcome.html'in karşılığı). Üç kip:
 * - setup: ilk kurulum (karşılama, kurulum adımları, özellik seçimi)
 * - update: güncellemeden sonra (Yenilikler + değişen özelliklerde rozet)
 * - guide: Ayarlar'dan açılan rehber
 */
export type GuideMode = { kind: 'setup' } | { kind: 'update'; from: string } | { kind: 'guide' };

/** Rehberin en son gösterildiği sürüm ve kurulumun bitip bitmediği (settings tablosu). */
const SEEN_KEY = 'desktop_seen_version';
const SETUP_DONE_KEY = 'desktop_setup_done';
/** 0.8.0 öncesi karşılama ekranının işareti (arkadaşın ilk sürümü); varsa kurulum bitmiş sayılır. */
const LEGACY_WELCOME_KEY = 'lifetools_desktop_welcome_done';
/** Bunlardan biri varsa uygulama daha önce kullanılmıştır (rehberden önceki sürümlerden güncelleme). */
const EXISTING_USER_KEYS = ['update_attempt', 'prefs', 'theme', 'ambient_last'];

const ICONS: Record<DesktopFeatureId, IconName> = {
  notlar: 'notebook-pen', izleme: 'clapperboard', sablonlar: 'message-square-text', pano: 'clipboard', ortam: 'headphones', piller: 'battery-medium'
};
const KIND_LABEL: Record<ChangeKind, string> = { new: 'Yeni', improved: 'İyileşti', fixed: 'Düzeltme', removed: 'Kaldırıldı' };

let mode: GuideMode = { kind: 'guide' };
export function setGuideMode(next: GuideMode): void { mode = next; }

function legacyWelcomeDone(): boolean {
  try { return localStorage.getItem(LEGACY_WELCOME_KEY) === '1'; } catch { return false; }
}

/** Açılışta rehber gösterilmeli mi? Gösterilecekse kipini döndürür; değilse null. */
export async function startupGuide(): Promise<GuideMode | null> {
  const [version, seen, setupDone, ...existing] = await Promise.all([
    getVersion(),
    api.getSetting(SEEN_KEY).catch(() => null),
    api.getSetting(SETUP_DONE_KEY).catch(() => null),
    ...EXISTING_USER_KEYS.map(key => api.getSetting(key).catch(() => null))
  ]);
  const usedBefore = setupDone === '1' || legacyWelcomeDone() || existing.some(v => v !== null);
  if (!usedBefore) return { kind: 'setup' };
  const from = whatsNewFrom(seen, version);
  if (from) return { kind: 'update', from };
  if (seen !== version) void api.setSetting(SEEN_KEY, version).catch(() => undefined);
  return null;
}

/** Rehberden çıkılınca: kurulum bitti ve bu sürümün yenilikleri görüldü. */
export function markGuideSeen(): void {
  void api.setSetting(SETUP_DONE_KEY, '1').catch(() => undefined);
  void getVersion().then(v => api.setSetting(SEEN_KEY, v)).catch(() => undefined);
}

function shortcutText(prefs: Prefs | null, key: keyof Prefs | undefined): string | null {
  if (!key || !prefs) return null;
  const value = String(prefs[key] ?? '').trim();
  return value ? value.replace(/\+/g, ' + ') : 'atanmamış';
}

export function mount(container: HTMLElement, navigate: (route: RouteId) => void): void {
  const current = mode;
  const feedback = h('p', { class: 'guide-feedback', role: 'status', 'aria-live': 'polite' });
  let feedbackTimer: number | undefined;
  const say = (text: string): void => {
    feedback.textContent = text;
    window.clearTimeout(feedbackTimer);
    feedbackTimer = window.setTimeout(() => { feedback.textContent = ''; }, 2500);
  };

  const title = h('h1', { id: 'guide-title' });
  const lede = h('p', { class: 'welcome-lede' });
  const eyebrow = h('p', { class: 'page-eyebrow' }, 'LIFETOOLS · MASAÜSTÜ');
  const primary = h('button', { type: 'button', class: 'primary welcome-start', onClick: () => { markGuideSeen(); navigate('anasayfa'); } });
  const keys = h('div', { class: 'welcome-keys', 'aria-label': 'Kısayolların' }, h('span', { class: 'welcome-keys-label' }, 'Kısayolların'));
  const hero = h('div', { class: 'welcome-hero card' }, h('div', { class: 'welcome-hero-copy' }, eyebrow, title, lede, primary), keys);

  if (current.kind === 'setup') {
    title.textContent = 'Hoş geldin.';
    lede.textContent = 'Birkaç adımda kuralım: Chrome eklentisini bağla, kullanacağın özellikleri seç. İstemediklerini kapatırsan menüden kalkar ve arka planda da çalışmaz.';
    primary.append('Kurulumu bitir', icon('arrow-right', 16));
  } else if (current.kind === 'update') {
    title.textContent = 'LifeTools güncellendi';
    lede.textContent = 'Nelerin değiştiği aşağıda. Değişen özelliklerin yanında "Yeni" ya da "Güncellendi" yazıyor.';
    primary.append('Uygulamaya dön', icon('arrow-right', 16));
    void getVersion().then(v => { title.textContent = `LifeTools ${v} sürümüne güncellendi`; eyebrow.textContent = `SÜRÜM ${v}`; }).catch(() => undefined);
  } else {
    title.textContent = 'Özellik rehberi';
    lede.textContent = 'Masaüstü uygulamasının her özelliği, örnekleri ve kısayollarıyla. İstemediğini kapat; menüden kalkar ve arka planda çalışmaz.';
    primary.append('Uygulamaya dön', icon('arrow-right', 16));
  }

  const sections: HTMLElement[] = [hero];

  // Yenilikler
  if (current.kind === 'update') {
    const list = h('div', { class: 'guide-changes' });
    void getVersion().then(version => {
      for (const entry of changesSince(current.from, version)) {
        const block = h('div', { class: 'guide-release' }, h('h3', {}, `Sürüm ${entry.version}`));
        for (const item of entry.items) block.append(h('div', { class: 'guide-change' }, h('span', { class: `guide-kind ${item.kind}` }, KIND_LABEL[item.kind]), h('span', {}, item.text)));
        list.append(block);
      }
    }).catch(() => undefined);
    sections.push(h('section', { class: 'card guide-card guide-news', 'aria-labelledby': 'guide-news-title' }, h('h2', { id: 'guide-news-title' }, 'Yenilikler'), list));
  }

  // Kurulum
  if (current.kind === 'setup') {
    const chromeStatus = h('span', { class: 'guide-status' }, 'Denetleniyor…');
    const autostart = h('input', { type: 'checkbox', 'aria-label': 'Windows açılınca başlat' }) as HTMLInputElement;
    autostart.addEventListener('change', () => {
      void api.autostartSet(autostart.checked).then(on => { autostart.checked = on; say(on ? 'Windows açılınca başlayacak' : 'Otomatik başlatma kapatıldı'); }).catch(() => { autostart.checked = !autostart.checked; say('Ayar değiştirilemedi'); });
    });
    void api.autostartGet().then(on => { autostart.checked = on; }).catch(() => undefined);
    void api.nativeStatus().then(s => {
      const ok = s.registered && s.path_matches;
      chromeStatus.textContent = ok ? 'Bağlı ✓' : 'Bağlı değil';
      chromeStatus.classList.add(ok ? 'ok' : 'todo');
    }).catch(() => { chromeStatus.textContent = 'Bilinmiyor'; });
    const step = (no: number, heading: Node[], body: Node[]) => h('li', { class: 'guide-step' }, h('span', { class: 'guide-step-no' }, String(no)), h('div', { class: 'guide-step-body' }, h('h3', {}, ...heading), ...body));
    sections.push(h('section', { class: 'card guide-card', 'aria-labelledby': 'guide-setup-title' },
      h('h2', { id: 'guide-setup-title' }, 'Kurulum'),
      h('ol', { class: 'guide-steps' },
        step(1, [document.createTextNode('Chrome eklentisini bağla '), chromeStatus], [
          h('p', {}, 'Bağlanınca eklentideki notların, izleme listen ve tarayıcı süren burada da görünür; video indirme de bu bağlantıyla çalışır.'),
          h('button', { type: 'button', class: 'link-button', onClick: () => { markGuideSeen(); navigate('ayarlar'); } }, 'Bağlantı ayarlarını aç', icon('arrow-right', 15))]),
        step(2, [document.createTextNode('Windows açılınca başlasın mı?')], [
          h('label', { class: 'settings-row guide-inline' }, h('span', { class: 'settings-label' }, 'Windows açılınca LifeTools\'u tepside başlat', h('span', { class: 'hint' }, 'Kısayolların, pano geçmişi ve pil bildirimleri ancak uygulama açıkken çalışır.')), h('span', { class: 'switch' }, autostart, h('span', { class: 'switch-track' })))]),
        step(3, [document.createTextNode('Kullanacağın özellikleri seç')], [h('p', {}, 'Aşağıda her özelliğin ne işe yaradığı, örneği ve kısayolu var. İstediğin zaman Ayarlar › Özellik rehberi\'nden değiştirebilirsin.')])
      )));
  }

  // Özellikler
  const grid = h('div', { class: 'guide-grid' });
  const inputs = new Map<DesktopFeatureId, HTMLInputElement>();
  const badges = current.kind === 'update' ? featureBadgesFor(current.from) : Promise.resolve(new Map<string, string>());
  const render = (prefs: Prefs | null, badgeMap: Map<string, string>) => {
    keys.querySelectorAll('.welcome-key-row').forEach(n => n.remove());
    grid.replaceChildren();
    for (const feature of DESKTOP_FEATURES) {
      const on = isOn(feature.id);
      const input = h('input', { type: 'checkbox', checked: on, 'aria-label': `${feature.name} aç / kapat` }) as HTMLInputElement;
      inputs.set(feature.id, input);
      input.addEventListener('change', () => {
        void setFeatures({ [feature.id]: input.checked }).then(() => { card.classList.toggle('off', !input.checked); open.hidden = !input.checked; say(`${feature.name} ${input.checked ? 'açıldı' : 'kapatıldı'}`); syncKeys(); })
          .catch(() => { input.checked = !input.checked; say('Kaydedilemedi'); });
      });
      const badge = badgeMap.get(feature.id);
      const shortcut = shortcutText(prefs, feature.shortcut);
      const open = h('button', { type: 'button', class: 'link-button', hidden: !on, onClick: () => { markGuideSeen(); navigate(feature.id); } }, 'Aç', icon('arrow-right', 15));
      const card = h('article', { class: 'guide-feature' + (on ? '' : ' off'), id: `guide-${feature.id}` },
        h('span', { class: 'welcome-card-icon' }, icon(ICONS[feature.id], 20)),
        h('div', { class: 'guide-feature-main' },
          h('div', { class: 'guide-feature-name' }, h('strong', {}, feature.name), badge ? h('span', { class: `guide-badge ${badge === 'Yeni' ? 'yeni' : 'guncellendi'}` }, badge) : null),
          h('p', { class: 'guide-feature-desc' }, feature.description),
          h('div', { class: 'guide-example' }, h('b', {}, 'Örnek: '), feature.example),
          h('div', { class: 'guide-meta' },
            shortcut ? h('span', {}, `${feature.shortcutLabel}: `, h('kbd', {}, shortcut)) : null,
            h('span', {}, `Kapatınca: ${feature.whenOff}`)),
          open),
        h('label', { class: 'switch guide-switch', title: on ? 'Kapat' : 'Aç' }, input, h('span', { class: 'switch-track' })));
      const demo = desktopDemo(feature.id);
      if (demo) card.append(h('div', { class: 'guide-demo' }, demo));
      grid.append(card);
    }
    const syncKeys = () => {
      keys.querySelectorAll('.welcome-key-row').forEach(n => n.remove());
      for (const feature of DESKTOP_FEATURES) {
        const text = shortcutText(prefs, feature.shortcut);
        if (!text || text === 'atanmamış' || !isOn(feature.id)) continue;
        keys.append(h('div', { class: 'welcome-key-row' }, h('span', {}, feature.shortcutLabel ?? feature.name), h('kbd', {}, text)));
      }
      keys.hidden = keys.querySelectorAll('.welcome-key-row').length === 0;
    };
    syncKeys();
  };
  const bulk = async (on: boolean) => {
    await setFeatures(Object.fromEntries(DESKTOP_FEATURES.map(f => [f.id, on])));
    for (const [, input] of inputs) input.checked = on;
    grid.querySelectorAll('.guide-feature').forEach(card => card.classList.toggle('off', !on));
    grid.querySelectorAll<HTMLButtonElement>('.guide-feature .link-button').forEach(b => { b.hidden = !on; });
    say(on ? 'Hepsi açıldı' : 'Hepsi kapatıldı');
    void Promise.all([api.prefsGet().catch(() => null), badges]).then(([p, b]) => render(p, b));
  };
  sections.push(h('section', { class: 'guide-features', 'aria-labelledby': 'guide-features-title' },
    h('div', { class: 'welcome-section-head' },
      h('h2', { id: 'guide-features-title' }, 'Özellikler'),
      h('div', { class: 'guide-bulk' },
        h('button', { type: 'button', onClick: () => void bulk(true) }, 'Hepsini aç'),
        h('button', { type: 'button', onClick: () => void bulk(false) }, 'Hepsini kapat'))),
    grid));
  render(null, new Map());
  void Promise.all([api.prefsGet().catch(() => null), badges]).then(([prefs, badgeMap]) => render(prefs, badgeMap));

  sections.push(h('p', { class: 'welcome-footnote' }, 'Kısayolları Ayarlar\'dan değiştirebilirsin. Bu sayfaya Ayarlar › Özellik rehberi\'nden her zaman dönebilirsin.'), feedback);
  container.replaceChildren(h('section', { class: 'welcome-page guide-page', 'aria-labelledby': 'guide-title' }, ...sections));
  // Güncelleme kipinde yenilikler görüldü sayılır (aynı sürüm için tekrar açılmaz).
  if (current.kind === 'update') void getVersion().then(v => api.setSetting(SEEN_KEY, v)).catch(() => undefined);
}

async function featureBadgesFor(from: string): Promise<Map<string, string>> {
  const version = await getVersion();
  return featureBadges(from, version, undefined, item => item.desktop);
}
