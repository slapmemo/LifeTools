import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { PAGE_THEME } from '../../core/page-theme';
import { cleanUrl } from '../link-cleaner/clean';
import { BUBBLE_ENABLED_KEY, BUBBLE_HIDDEN_KEY, bubbleButtons, bubblePosition, selectionUrl, shouldShowBubble, translationTarget, languageName, translationText, translationAvailabilityState } from './bubble-logic';
import { getTranslator } from './translate';
import { datedTask, looksLikeAddress } from './bubble-logic';

let enabled = false;
let hiddenSites: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let host: HTMLElement | undefined;
let flags: unknown = {};
let panelOpen = false;

function hide(): void { clearTimeout(timer); host?.remove(); host = undefined; panelOpen = false; }
function editable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"])');
}
async function loadSettings(): Promise<void> {
  const data = await chrome.storage.local.get({ [BUBBLE_ENABLED_KEY]: false, [BUBBLE_HIDDEN_KEY]: [], [MODULE_FLAGS_KEY]: {} });
  enabled = data[BUBBLE_ENABLED_KEY] === true && resolveEnabled(data[MODULE_FLAGS_KEY], 'slapmemo');
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
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = PAGE_THEME + `:host{position:fixed;z-index:2147483647} .pill{display:flex;align-items:center;white-space:nowrap;background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:10px;box-shadow:var(--lt-shadow);padding:3px} button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;min-height:28px;padding:3px 8px;border-radius:8px} button:hover{background:var(--lt-sub)} button.primary{background:var(--lt-accent);color:var(--lt-on-accent)} button.primary:hover{opacity:.88} .close{font-size:16px;padding:2px 7px;color:var(--lt-muted)} @media(max-width:600px){.label{display:none}button{padding:3px 5px}}`;
  const pill = document.createElement('div'); pill.className = 'pill';
  style.textContent += `.translation{box-sizing:border-box;width:min(420px,calc(100vw - 16px));max-height:260px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;background:var(--lt-surface);color:var(--lt-text);border:1px solid var(--lt-border);border-radius:10px;box-shadow:var(--lt-shadow);padding:10px;margin-top:4px}.translation header{display:flex;align-items:center;justify-content:space-between;font-weight:600}.translation .actions{display:flex;flex-wrap:wrap;margin-top:8px}.translation .content{margin-top:6px}`;
  pill.addEventListener('mousedown', event => event.preventDefault());
  const save = document.createElement('button'); save.type = 'button'; save.textContent = '📝 Not';
  save.className = 'primary';
  save.addEventListener('click', () => {
    hide();
    void chrome.runtime.sendMessage({ type: 'slapmemo:save', text, url: location.href, title: document.title, category: 'note' })
      .then(result => pageToast(result?.ok ? result : { ok: false })).catch(() => pageToast({ ok: false }));
  });
  const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = '×'; close.title = 'Bu sitede gösterme'; close.setAttribute('aria-label', close.title);
  close.addEventListener('click', () => {
    hide();
    void (async () => {
      const data = await chrome.storage.local.get({ [BUBBLE_HIDDEN_KEY]: [] });
      const sites = Array.isArray(data[BUBBLE_HIDDEN_KEY]) ? data[BUBBLE_HIDDEN_KEY].filter((site: unknown): site is string => typeof site === 'string') : [];
      await chrome.storage.local.set({ [BUBBLE_HIDDEN_KEY]: [...new Set([...sites, location.hostname])] });
    })();
  });
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
  if ('Translator' in self) pill.append(button('🌐', 'Çevir', () => {
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
      const input = translationText(text);
      let source = 'en';
      if ('LanguageDetector' in self) {
        try {
          const detected = (await (await LanguageDetector.create()).detect(input))[0];
          if (detected && detected.confidence >= 0.5 && detected.detectedLanguage) source = detected.detectedLanguage;
        } catch { /* Dil algılanamazsa İngilizce kullanılır. */ }
      }
      const target = translationTarget(source);
      heading.textContent = `${languageName(source)} → ${languageName(target)}`;
      const pair = { sourceLanguage: source, targetLanguage: target };
      const state = translationAvailabilityState(await Translator.availability(pair));
      if (state === 'unsupported') { content.textContent = 'Bu dil çifti bu cihazda desteklenmiyor'; return; }
      content.textContent = state === 'downloading' ? 'Dil modeli indiriliyor… %0' : 'Çevriliyor…';
      const translator = await getTranslator(pair, loaded => { content.textContent = `Dil modeli indiriliyor… %${Math.round(Math.max(0, Math.min(1, loaded)) * 100)}`; });
      content.textContent = 'Çevriliyor…';
      const result = await translator.translate(input);
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
    })().catch(() => { content.textContent = 'Çeviri yapılamadı'; });
  }));
  pill.append(close); shadow.append(style, pill); (document.body || document.documentElement).append(host);
  const size = host.getBoundingClientRect();
  const position = bubblePosition(rect, { width: innerWidth, height: innerHeight }, size);
  host.style.left = `${position.left}px`; host.style.top = `${position.top}px`;
}
function schedule(): void { hide(); timer = setTimeout(show, 150); }
document.addEventListener('mouseup', event => { if (!host || !event.composedPath().includes(host)) schedule(); });
document.addEventListener('keyup', event => { if (!panelOpen && event.shiftKey && event.key.startsWith('Arrow')) schedule(); });
document.addEventListener('pointerdown', event => { if (host && !event.composedPath().includes(host)) hide(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
document.addEventListener('selectionchange', () => { if (!panelOpen && !window.getSelection()?.toString().trim()) hide(); });
window.addEventListener('scroll', event => { if (!host || !event.composedPath().includes(host)) hide(); }, true);
