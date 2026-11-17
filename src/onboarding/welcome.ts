import { modules } from '../modules';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../core/module-state';
import { ONBOARDING_DONE_KEY, SEEN_VERSION_KEY, recommendedFlags } from '../core/onboarding';
import { applyTheme } from '../core/theme';
import { desktopVersion } from '../core/desktop-version';
import { getBackend } from '../db/backend';
import { changesSince, featureBadges, type ChangeKind } from '../core/whats-new';
import { FEATURE_GUIDE, FIRST_STEPS, GUIDE_CATEGORIES } from './catalog';
import { featureDemos } from './demos';

/**
 * Üç kip: ilk kurulum (?setup=1 ya da kurulum hiç bitirilmediyse), güncelleme sonrası (?from=0.6.0)
 * ve istendiğinde açılan özellik rehberi. Anahtarlar anında kaydedilir.
 */
type Mode = 'setup' | 'update' | 'guide';
const KIND_LABEL: Record<ChangeKind, string> = { new: 'Yeni', improved: 'İyileşti', fixed: 'Düzeltme', removed: 'Kaldırıldı' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const version = chrome.runtime.getManifest().version;
const params = new URLSearchParams(location.search);
const inputs = new Map<string, HTMLInputElement>();
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function toast(text: string): void {
  const box = $('toast');
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2200);
}

async function saveFlags(flags: Record<string, boolean>, message = 'Kaydedildi'): Promise<void> {
  const current = (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY] as Record<string, boolean>;
  await chrome.storage.local.set({ [MODULE_FLAGS_KEY]: { ...current, ...flags } });
  for (const [id, on] of Object.entries(flags)) inputs.get(id)?.closest('.feature')?.classList.toggle('off', !on);
  toast(message);
}

function renderWhatsNew(from: string): void {
  const entries = changesSince(from, version);
  if (!entries.length) return;
  $('whats-new').hidden = false;
  const list = $('whats-new-list');
  for (const entry of entries) {
    const block = el('div', 'release');
    block.append(el('h3', '', `Sürüm ${entry.version}`));
    for (const item of entry.items) {
      const row = el('div', 'change');
      row.append(el('span', `kind ${item.kind}`, KIND_LABEL[item.kind]), el('span', '', item.text));
      block.append(row);
    }
    list.append(block);
  }
}

function shortcutChips(names: readonly string[], keys: Map<string, string>): HTMLElement | null {
  if (!names.length) return null;
  const wrap = el('span');
  names.forEach((name, i) => {
    const key = keys.get(name);
    if (i) wrap.append(' ');
    wrap.append(key ? el('kbd', '', key) : el('span', '', 'kısayol atanmamış'));
  });
  return wrap;
}

function renderFeatures(flags: unknown, badges: Map<string, string>, keys: Map<string, string>): void {
  const groups = $('groups');
  for (const category of GUIDE_CATEGORIES) {
    const items = modules.filter(m => FEATURE_GUIDE[m.id]?.category === category);
    if (!items.length) continue;
    const section = el('section', 'group');
    section.append(el('h3', '', category));
    const list = el('div', 'feature-list');
    for (const module of items) {
      const guide = FEATURE_GUIDE[module.id];
      const on = resolveEnabled(flags, module.id);
      const card = el('div', 'feature' + (on ? '' : ' off'));
      card.id = `feature-${module.id}`;

      const main = el('div', 'feature-main');
      const name = el('div', 'feature-name', module.name);
      const badge = badges.get(module.id);
      if (badge) name.append(el('span', `badge ${badge === 'Yeni' ? 'yeni' : 'guncellendi'}`, badge));
      if (guide.needsDesktop) name.append(el('span', 'badge desktop', 'Masaüstü gerekli'));
      const example = el('div', 'feature-example');
      example.append(el('b', '', 'Örnek: '), guide.example);
      const meta = el('div', 'feature-meta');
      meta.append(el('span', '', `Nerede: ${guide.where}`));
      const chips = shortcutChips(guide.commands ?? [], keys);
      if (chips) { const s = el('span', '', 'Kısayol: '); s.append(chips); meta.append(s); }
      main.append(name, el('div', 'feature-desc', module.description));
      main.append(...featureDemos(module.id));
      main.append(example, meta);

      const toggle = el('label', 'switch');
      toggle.title = on ? 'Kapat' : 'Aç';
      const input = el('input');
      input.type = 'checkbox';
      input.checked = on;
      input.setAttribute('aria-label', `${module.name} aç / kapat`);
      input.addEventListener('change', () => void saveFlags({ [module.id]: input.checked }, `${module.name} ${input.checked ? 'açıldı' : 'kapatıldı'}`));
      inputs.set(module.id, input);
      toggle.append(input, el('span', 'switch-track'));

      card.append(main, toggle);
      list.append(card);
    }
    section.append(list);
    groups.append(section);
  }
}

async function bulk(flags: Record<string, boolean>, message: string): Promise<void> {
  for (const [id, input] of inputs) input.checked = flags[id] ?? input.checked;
  await saveFlags(flags, message);
}

async function renderSetupStatus(): Promise<void> {
  try {
    const settings = await (chrome.action as unknown as { getUserSettings?: () => Promise<{ isOnToolbar?: boolean }> }).getUserSettings?.();
    const pin = $('pin-status');
    if (settings?.isOnToolbar !== undefined) { pin.textContent = settings.isOnToolbar ? 'Sabitlendi ✓' : 'Henüz sabitlenmedi'; pin.className = `status ${settings.isOnToolbar ? 'ok' : 'todo'}`; }
  } catch { /* eski Chrome: durumu gösterme */ }
  const status = $('desktop-status');
  const help = $('desktop-help');
  const [desktop, backend] = await Promise.all([desktopVersion(), getBackend().catch(() => 'browser' as const)]);
  if (!desktop) {
    status.textContent = 'Bulunamadı'; status.className = 'status todo';
    help.textContent = 'Uygulamayı kur, açınca Ayarlar › Chrome bağlantısı › "Bağla"ya bas. Sonra buradan "Depolama ayarlarını aç" › "Verileri masaüstüne taşı".';
  } else if (backend !== 'desktop') {
    status.textContent = `Bağlı (v${desktop.version}) · veriler henüz tarayıcıda`; status.className = 'status todo';
    help.textContent = '"Depolama ayarlarını aç" › "Verileri masaüstüne taşı" dersen notların ve listen iki tarafta da görünür.';
    $('desktop-download').hidden = true;
  } else {
    status.textContent = `Bağlı (v${desktop.version}) ✓`; status.className = 'status ok';
    help.textContent = '';
    $('desktop-download').hidden = true;
  }
}

async function init(): Promise<void> {
  await applyTheme();
  const data = await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: null, [ONBOARDING_DONE_KEY]: false });
  const from = params.get('from');
  const mode: Mode = params.get('setup') ? 'setup' : from ? 'update' : params.get('guide') || data[ONBOARDING_DONE_KEY] ? 'guide' : 'setup';
  document.body.dataset.mode = mode;

  if (mode === 'setup') {
    $('title').textContent = 'LifeTools\'a hoş geldin';
    $('subtitle').textContent = 'Birkaç dakikada kuralım: eklentiyi sabitle, masaüstünü bağla, kullanacağın özellikleri seç.';
    $('first-steps').hidden = false;
    const tips = $('first-steps-list');
    for (const tip of FIRST_STEPS) { const t = el('div', 'tip'); t.append(el('strong', '', tip.title), el('span', '', tip.text)); tips.append(t); }
  } else if (mode === 'update') {
    $('title').textContent = `LifeTools ${version} sürümüne güncellendi`;
    $('subtitle').textContent = 'Nelerin değiştiği aşağıda. Değişen özelliklerin yanında "Yeni" ya da "Güncellendi" yazıyor.';
    ($('setup') as HTMLDetailsElement).open = false;
    renderWhatsNew(from!);
  } else {
    $('title').textContent = 'Özellik rehberi';
    $('subtitle').textContent = 'LifeTools\'un her özelliği, örnekleri ve kısayollarıyla. Anahtarlarla açıp kapatabilirsin.';
    ($('setup') as HTMLDetailsElement).open = false;
  }
  $('footer').textContent = `LifeTools ${version} · Bu sayfayı Panel › Ayarlar'dan ya da açılır penceredeki sürüm yazısından her zaman açabilirsin.`;

  const commands = await chrome.commands.getAll().catch(() => [] as chrome.commands.Command[]);
  const keys = new Map(commands.filter(c => c.name && c.shortcut).map(c => [c.name!, c.shortcut!]));
  renderFeatures(data[MODULE_FLAGS_KEY], from ? featureBadges(from, version) : new Map(), keys);
  void renderSetupStatus();
  // Rehber görüldü: aynı sürüm için güncellemede bir daha açılmasın.
  await chrome.storage.local.set({ [SEEN_VERSION_KEY]: version });
}

$('recommended').addEventListener('click', () => void bulk(recommendedFlags(modules.map(m => m.id)), 'Önerilenler seçildi'));
$('select-all').addEventListener('click', () => void bulk(Object.fromEntries(modules.map(m => [m.id, true])), 'Hepsi açıldı'));
$('select-none').addEventListener('click', () => void bulk(Object.fromEntries(modules.map(m => [m.id, false])), 'Hepsi kapatıldı'));
$('finish').addEventListener('click', () => {
  void chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: true }).then(() => {
    toast('Kurulum tamam ✓');
    $('panel-link').hidden = false;
  });
});
void init();
