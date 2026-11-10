import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { PAGE_THEME } from '../../core/page-theme';
import { cleanUrl } from '../link-cleaner/clean';
import { BUBBLE_ENABLED_KEY, BUBBLE_HIDDEN_KEY, bubbleButtons, bubblePosition, selectionUrl, shouldShowBubble, languageName, translationText } from './bubble-logic';
import { datedTask, looksLikeAddress } from './bubble-logic';
import { convert, findPriceAt, formatTry, parsePrice, type Rates } from '../currency/rates';

let enabled = false;
let hiddenSites: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let host: HTMLElement | undefined;
let flags: unknown = {};
let panelOpen = false;

function hide(): void { clearTimeout(timer); timer = undefined; host?.remove(); host = undefined; panelOpen = false; }
function editable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
}
async function loadSettings(): Promise<void> {
  const data = await chrome.storage.local.get({ [BUBBLE_ENABLED_KEY]: true, [BUBBLE_HIDDEN_KEY]: [], [MODULE_FLAGS_KEY]: {} });
  enabled = data[BUBBLE_ENABLED_KEY] !== false && resolveEnabled(data[MODULE_FLAGS_KEY], 'slapmemo');
  flags = data[MODULE_FLAGS_KEY];
  hiddenSites = Array.isArray(data[BUBBLE_HIDDEN_KEY]) ? data[BUBBLE_HIDDEN_KEY].filter((site: unknown): site is string => typeof site === 'string') : [];
  if (!enabled || hiddenSites.includes(location.hostname)) hide();
}
void loadSettings();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[BUBBLE_ENABLED_KEY] || changes[BUBBLE_HIDDEN_KEY] || changes[MODULE_FLAGS_KEY])) void loadSettings();
});

function show(): void {
  hide();
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!selection || !selection.rangeCount || !shouldShowBubble(text, editable(selection.anchorNode) || editable(selection.focusNode) || editable(document.activeElement), location.hostname, hiddenSites, enabled)) return;
  const range = selection.getRangeAt(0).cloneRange();
  range.collapse(false);
  let rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) rect = selection.getRangeAt(0).getBoundingClientRect();
  host = document.createElement('div');
  host.setAttribute('data-lifetools-slapmemo-bubble', '');
  const bubbleHost = host;
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PAGE_THEME + `:host{position:fixed;z-index:2147483647} .pill{display:flex;align-items:center;white-space:nowrap;background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:10px;box-shadow:var(--lt-shadow);padding:3px} button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;min-height:28px;padding:3px 8px;border-radius:8px} button:hover{background:var(--lt-sub)} button.primary{background:var(--lt-accent);color:var(--lt-on-accent)} button.primary:hover{opacity:.88} .close{font-size:16px;padding:2px 7px;color:var(--lt-muted)} @media(max-width:600px){.label{display:none}button{padding:3px 5px}}`;
  const pill = document.createElement('div'); pill.className = 'pill';
  style.textContent += `.more-wrap{position:relative}.menu{position:absolute;right:0;top:100%;z-index:1;background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:8px;box-shadow:var(--lt-shadow);padding:3px}.menu button{height:28px;white-space:nowrap}`;
  style.textContent += `.fx{font-weight:700;padding:3px 8px;border-radius:8px;background:var(--lt-accent-soft);color:var(--lt-text);cursor:pointer}`;
  style.textContent += `.translation{box-sizing:border-box;width:min(420px,calc(100vw - 16px));max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:10px;box-shadow:var(--lt-shadow);padding:10px;margin-top:4px}.translation header{display:flex;align-items:center;justify-content:space-between;font-weight:600}.translation .actions{display:flex;flex-wrap:wrap;margin-top:8px}.translation .content{margin-top:6px}`;
  pill.addEventListener('mousedown', event => event.preventDefault());
  const save = document.createElement('button'); save.type = 'button'; save.textContent = '📝 Not';
  save.className = 'primary';
  save.addEventListener('click', () => {
    hide();
    void chrome.runtime.sendMessage({ type: 'slapmemo:save', text, url: location.href, title: document.title, category: 'note' })
      .then(result => pageToast(result?.ok ? result : { ok: false })).catch(() => pageToast({ ok: false }));
  });
  const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×'; close.title = 'Kapat'; close.setAttribute('aria-label', close.title);
  close.addEventListener('click', hide);
  const moreWrap = document.createElement('div'); moreWrap.className = 'more-wrap';
  const more = document.createElement('button'); more.type = 'button'; more.textContent = '⋯'; more.title = 'Diğer'; more.setAttribute('aria-label', more.title); more.setAttribute('aria-expanded', 'false');
  const menu = document.createElement('div'); menu.className = 'menu'; menu.hidden = true;
  const hideSite = document.createElement('button'); hideSite.type = 'button'; hideSite.textContent = 'Bu sitede gösterme';
  more.addEventListener('click', () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); });
  hideSite.addEventListener('click', () => {
    hide();
    void (async () => {
      const hostname = location.hostname;
      const data = await chrome.storage.local.get({ [BUBBLE_HIDDEN_KEY]: [] });
      const sites = Array.isArray(data[BUBBLE_HIDDEN_KEY]) ? data[BUBBLE_HIDDEN_KEY].filter((site: unknown): site is string => typeof site === 'string') : [];
      await chrome.storage.local.set({ [BUBBLE_HIDDEN_KEY]: [...new Set([...sites, hostname])] });
      pageToast({ ok: true, title: `${hostname}'da gizlendi`, detail: "Panel › Notlar'dan tekrar açabilirsin", onUndo: async () => {
        const current = await chrome.storage.local.get({ [BUBBLE_HIDDEN_KEY]: [] });
        const saved = Array.isArray(current[BUBBLE_HIDDEN_KEY]) ? current[BUBBLE_HIDDEN_KEY].filter((site: unknown): site is string => typeof site === 'string') : [];
        await chrome.storage.local.set({ [BUBBLE_HIDDEN_KEY]: saved.filter(site => site !== hostname) });
      } });
    })().catch(() => pageToast({ ok: false }));
  });
  menu.append(hideSite); moreWrap.append(more, menu);
  const visible = bubbleButtons(text, flags);
  const button = (icon: string, label: string, click: () => void) => {
    const item = document.createElement('button'); item.type = 'button'; item.title = label; item.setAttribute('aria-label', label);
    item.append(document.createTextNode(icon), Object.assign(document.createElement('span'), { className: 'label', textContent: ` ${label}` }));
    item.addEventListener('click', click); return item;
  };
  save.replaceChildren(document.createTextNode('📝'), Object.assign(document.createElement('span'), { className: 'label', textContent: ' Not' })); save.title = 'Not'; save.setAttribute('aria-label', 'Not');
  if (visible.includes('slapmemo')) pill.append(save);
  for (const [id, icon, label, success] of [
    ['quick-tasks', '✅', 'Görev', 'Görev eklendi ✓'], ['watchlist', '🎬', 'İzle', 'İzleme listesine eklendi ✓']
  ]) if (visible.includes(id)) pill.append(button(icon, label, () => {
    hide();
    void chrome.runtime.sendMessage({ type: `${id}:add`, title: text.slice(0, 300), url: location.href })
      .then(result => pageToast(result?.ok ? { ...result, title: success, undoType: `${id}:undo` } : { ok: false })).catch(() => pageToast({ ok: false }));
  }));
  const dueTask = visible.includes('quick-tasks') ? datedTask(text, new Date()) : null;
  if (dueTask) pill.append(button('📅', 'Görev (tarihli)', () => {
    hide();
    const [date, time] = dueTask.due.split(' ');
    const [year, month, day] = date.split('-').map(Number);
    const label = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day)) + (time ? ` ${time}` : '');
    void chrome.runtime.sendMessage({ type: 'quick-tasks:add', title: dueTask.title, due_date: dueTask.due, url: location.href })
      .then(result => pageToast(result?.ok ? { ...result, title: `Görev eklendi: ${label} ✓`, undoType: 'quick-tasks:undo' } : { ok: false })).catch(() => pageToast({ ok: false }));
  }));
  const openSearch = (kind: 'search' | 'maps') => {
    hide();
    void chrome.runtime.sendMessage({ type: 'slapmemo:open-search', kind, text }).then(result => { if (!result?.ok) pageToast({ ok: false }); }).catch(() => pageToast({ ok: false }));
  };
  if (text.length <= 300) pill.append(button('🔎', 'Ara', () => openSearch('search')));
  if (looksLikeAddress(text)) pill.append(button('📍', 'Haritada aç', () => openSearch('maps')));
  if (visible.includes('link-cleaner')) pill.append(button('🔗', 'Temiz link', () => {
    const cleaned = cleanUrl(selectionUrl(text) ?? '');
    if (!cleaned) { hide(); pageToast({ ok: false }); return; }
    const copied = navigator.clipboard.writeText(cleaned.url); hide();
    void copied.then(() => pageToast({ ok: true, title: cleaned.removed.length ? 'Temiz link kopyalandı ✓' : 'Kaldırılacak takip parametresi yok' })).catch(() => pageToast({ ok: false }));
  }));
  if (visible.includes('clip-slots')) pill.append(button('📋', 'Yuva', () => {
    pill.replaceChildren();
    for (let slot = 1; slot <= 5; slot++) {
      const choice = button(String(slot), '', () => {
        hide(); void chrome.runtime.sendMessage({ type: 'clip-slots:set', slot, text: text.slice(0, 10000) })
          .then(result => pageToast(result?.ok ? { ok: true, title: `Yuva ${slot}'e kaydedildi ✓` } : { ok: false })).catch(() => pageToast({ ok: false }));
      }); choice.title = `Yuva ${slot}`; choice.setAttribute('aria-label', choice.title); pill.append(choice);
    }
    pill.append(close);
  }));
  pill.append(button('🌐', 'Çevir', () => {
    shadow.querySelector('.translation')?.remove();
    panelOpen = true;
    const panel = document.createElement('div'); panel.className = 'translation';
    const header = document.createElement('header');
    const heading = document.createElement('span'); heading.textContent = 'Çevriliyor…';
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'close'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Çeviriyi kapat');
    dismiss.addEventListener('click', () => { panel.remove(); panelOpen = false; });
    header.append(heading, dismiss);
    const content = document.createElement('div'); content.className = 'content'; content.textContent = 'Çevriliyor…';
    panel.append(header, content); shadow.append(panel);
    const bounds = panel.getBoundingClientRect();
    if (bounds.right > innerWidth - 8) panel.style.transform = `translateX(${innerWidth - 8 - bounds.right}px)`;
    if (bounds.bottom > innerHeight - 8) panel.style.marginTop = `${Math.min(4, innerHeight - 8 - bounds.bottom + 4)}px`;
    void (async () => {
      const response = await chrome.runtime.sendMessage({ type: 'translate:text', text: translationText(text) });
      if (!response?.ok) {
        content.textContent = response?.error === 'network' ? 'Çeviri yapılamadı, internet bağlantını kontrol et' : response?.error === 'rate' ? 'Google çeviriyi geçici olarak engelledi, biraz sonra tekrar dene' : 'Çeviri yapılamadı';
        return;
      }
      heading.textContent = `${languageName(response.source)} → ${languageName(response.target)}`;
      const result: string = response.text;
      content.textContent = result;
      const actions = document.createElement('div'); actions.className = 'actions';
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Kopyala';
      copy.addEventListener('click', () => { void navigator.clipboard.writeText(result).then(() => { copy.textContent = 'Kopyalandı ✓'; }).catch(() => pageToast({ ok: false })); });
      const saveTranslation = document.createElement('button'); saveTranslation.type = 'button'; saveTranslation.textContent = 'Not olarak kaydet';
      saveTranslation.addEventListener('click', () => {
        void chrome.runtime.sendMessage({ type: 'slapmemo:save', text: result, url: location.href, title: document.title, category: 'note' })
          .then(response => pageToast(response?.ok ? response : { ok: false })).catch(() => pageToast({ ok: false }));
      });
      actions.append(copy, saveTranslation); panel.append(actions);
    })().catch(() => { content.textContent = 'Çeviri yapılamadı, internet bağlantını kontrol et'; });
  }));
  pill.append(moreWrap, close); shadow.append(style, pill); (document.body || document.documentElement).append(host);
  const size = host.getBoundingClientRect();
  const position = bubblePosition(rect, { width: innerWidth, height: innerHeight }, size);
  host.style.left = `${position.left}px`; host.style.top = `${position.top}px`;
  const price = text.length <= 40 ? parsePrice(text) ?? findPriceAt(text, Math.floor(text.length / 2)) : null;
  if (price) void (chrome.runtime.sendMessage({ channel: 'currency', type: 'rates' }) as Promise<Rates | null>).then(rates => {
    if (!rates || host !== bubbleHost || !bubbleHost.isConnected || window.getSelection()?.toString().trim() !== text) return;
    const value = convert(price, rates.perTry);
    if (value === null) return;
    const tl = `≈ ${formatTry(value)}`;
    const symbol = ({ USD: '$', EUR: '€', GBP: '£', JPY: '¥', PLN: 'zł' } as Record<string, string>)[price.currency] ?? price.currency;
    const date = rates.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
    const chip = document.createElement('span'); chip.className = 'fx'; chip.textContent = tl;
    chip.title = `1 ${price.currency === 'DEM' ? 'DM' : symbol} = ${formatTry(convert({ currency: price.currency, amount: 1 }, rates.perTry)!)}${price.currency === 'DEM' ? ' · 1 € = 1,95583 DM' : ''} · ECB ${date}${rates.stale ? ' · eski kur' : ''}`;
    chip.setAttribute('role', 'button'); chip.tabIndex = 0; chip.setAttribute('aria-label', `${tl} kopyala`);
    const copy = () => { void navigator.clipboard.writeText(tl).then(() => {
      chip.textContent = 'Kopyalandı ✓';
      setTimeout(() => { chip.textContent = tl; }, 1500);
    }).catch(() => {}); };
    chip.addEventListener('click', copy);
    chip.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); copy(); } });
    pill.prepend(chip);
    const updated = bubblePosition(rect, { width: innerWidth, height: innerHeight }, bubbleHost.getBoundingClientRect());
    bubbleHost.style.left = `${updated.left}px`; bubbleHost.style.top = `${updated.top}px`;
  }).catch(() => {});
}
function schedule(): void { hide(); timer = setTimeout(show, 40); }
document.addEventListener('mouseup', event => { if (!enabled || hiddenSites.includes(location.hostname)) return; if (!host || !event.composedPath().includes(host)) schedule(); });
document.addEventListener('keyup', event => { if (!enabled || hiddenSites.includes(location.hostname)) return; if (!panelOpen && event.shiftKey && event.key.startsWith('Arrow')) schedule(); });
document.addEventListener('pointerdown', event => { if (host && !event.composedPath().includes(host)) hide(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
document.addEventListener('selectionchange', () => { if ((!host && timer === undefined) || panelOpen) return; const selection = window.getSelection(); if (!selection || selection.isCollapsed || !selection.toString().trim()) hide(); });
window.addEventListener('scroll', event => { if (!host) return; if (!event.composedPath().includes(host)) hide(); }, true);
