import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { cleanUrl } from '../link-cleaner/clean';
import { BUBBLE_ENABLED_KEY, BUBBLE_HIDDEN_KEY, bubbleButtons, bubblePosition, selectionUrl, shouldShowBubble } from './bubble-logic';

let enabled = false;
let hiddenSites: string[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let host: HTMLElement | undefined;
let flags: unknown = {};

function hide(): void { clearTimeout(timer); host?.remove(); host = undefined; }
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
  style.textContent = `:host{all:initial;position:fixed;z-index:2147483647;font:13px system-ui,sans-serif} .pill{display:flex;align-items:center;white-space:nowrap;background:white;color:#20242b;border:1px solid #ccd2d9;border-radius:20px;box-shadow:0 3px 14px #0003;padding:2px} button{font:inherit;color:inherit;background:transparent;border:0;cursor:pointer;padding:5px 8px;border-radius:16px} button:hover{background:#e8edf2} .close{font-size:16px;padding:2px 7px} @media(max-width:600px){.label{display:none}button{padding:5px}} @media(prefers-color-scheme:dark){.pill{background:#252a31;color:#f2f4f6;border-color:#59616a}button:hover{background:#424a55}}`;
  const pill = document.createElement('div'); pill.className = 'pill';
  pill.addEventListener('mousedown', event => event.preventDefault());
  const save = document.createElement('button'); save.type = 'button'; save.textContent = '📝 Not';
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
  pill.append(close); shadow.append(style, pill); (document.body || document.documentElement).append(host);
  const size = host.getBoundingClientRect();
  const position = bubblePosition(rect, { width: innerWidth, height: innerHeight }, size);
  host.style.left = `${position.left}px`; host.style.top = `${position.top}px`;
}
function schedule(): void { hide(); timer = setTimeout(show, 150); }
document.addEventListener('mouseup', event => { if (!host || !event.composedPath().includes(host)) schedule(); });
document.addEventListener('keyup', event => { if (event.shiftKey && event.key.startsWith('Arrow')) schedule(); });
document.addEventListener('pointerdown', event => { if (host && !event.composedPath().includes(host)) hide(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
document.addEventListener('selectionchange', () => { if (!window.getSelection()?.toString().trim()) hide(); });
window.addEventListener('scroll', hide, true);
