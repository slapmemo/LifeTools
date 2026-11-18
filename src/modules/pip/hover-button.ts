import { pageToast } from '../../core/page-toast';
import { livePageTheme } from '../../core/page-theme';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { bigEnough, PIP_HOVER_ENABLED_KEY, pickVideoAt, pipButtonPosition } from './hover-logic';
// Tema ayarını erken okumaya başla; kutular oluşturulurken hazır olsun.
livePageTheme();

let enabled = false;
let video: HTMLVideoElement | undefined;
let host: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let pointerX = -1;
let pointerY = -1;
let lastCheck = 0;
let trailing: ReturnType<typeof setTimeout> | undefined;
const CHECK_MS = 50;

function hide(): void { clearTimeout(timer); host?.remove(); host = undefined; video = undefined; }
function scheduleHide(): void { clearTimeout(timer); timer = setTimeout(hide, 1500); }
function playable(v: HTMLVideoElement): boolean {
  return !v.disablePictureInPicture && (!v.paused || !!v.currentSrc || !!v.src || !!v.srcObject || !!v.querySelector('source[src]'));
}
function eligible(v: HTMLVideoElement, r: DOMRect = v.getBoundingClientRect()): boolean {
  return bigEnough(r.width, r.height) && playable(v);
}
function position(): void {
  if (!host || !video) return;
  if (!video.isConnected || !eligible(video)) { hide(); return; }
  const pos = pipButtonPosition(video.getBoundingClientRect(), location.hostname, { width: innerWidth, height: innerHeight });
  host.style.left = `${pos.left}px`; host.style.top = `${pos.top}px`;
}
function show(v: HTMLVideoElement): void {
  if (!enabled) return;
  clearTimeout(timer);
  if (video === v && host) { position(); return; }
  hide(); video = v;
  host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = livePageTheme() + ':host{position:fixed;z-index:2147483647}button{width:28px;height:28px;border:1px solid var(--lt-border);border-radius:8px;background:var(--lt-surface);color:var(--lt-text);font:20px/1 system-ui;cursor:pointer;box-shadow:var(--lt-shadow)}button:hover{background:var(--lt-accent-soft);color:var(--lt-accent)}';
  const button = document.createElement('button'); button.type = 'button'; button.title = 'Resim içinde resim'; button.setAttribute('aria-label', button.title); button.textContent = '⧉';
  button.addEventListener('click', event => {
    // Oynatıcının kendi tıklama işleyicisi (oynat/duraklat) tetiklenmesin.
    event.stopPropagation();
    const target = video;
    if (!target) return;
    void (async () => {
      try {
        if (document.pictureInPictureElement === target) await document.exitPictureInPicture();
        else if (target.disablePictureInPicture) pageToast({ ok: false, title: 'Bu video resim içinde resme izin vermiyor.' });
        else await target.requestPictureInPicture();
      } catch { pageToast({ ok: false, title: 'Resim içinde resim açılamadı.' }); }
    })();
  });
  host.addEventListener('mouseenter', () => clearTimeout(timer));
  host.addEventListener('mouseleave', scheduleHide);
  shadow.append(style, button); (document.body || document.documentElement).append(host); position();
}
function overHost(x: number, y: number): boolean {
  if (!host) return false;
  const r = host.getBoundingClientRect();
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}
/** İmlecin altındaki videoyu bulur (üstte saydam katman olsa bile). */
function videoAt(x: number, y: number): HTMLVideoElement | undefined {
  const items: { v: HTMLVideoElement; rect: DOMRect }[] = [];
  for (const v of document.querySelectorAll('video')) {
    const rect = v.getBoundingClientRect();
    if (eligible(v, rect)) items.push({ v, rect });
  }
  return pickVideoAt(items, x, y)?.v;
}
function update(): void {
  lastCheck = performance.now();
  if (!enabled) return;
  if (overHost(pointerX, pointerY)) { clearTimeout(timer); return; }
  const v = videoAt(pointerX, pointerY);
  if (v) show(v);
  else if (video) scheduleHide();
}
document.addEventListener('pointermove', event => {
  pointerX = event.clientX; pointerY = event.clientY;
  if (!enabled) return;
  // En fazla 50 ms'de bir denetle; son hareket de kaçmasın diye bekleyen bir denetim kalır.
  // (requestAnimationFrame yerine zamanlayıcı: çizilmeyen sekmelerde/panellerde de çalışır.)
  if (performance.now() - lastCheck >= CHECK_MS) update();
  else if (!trailing) trailing = setTimeout(() => { trailing = undefined; update(); }, CHECK_MS);
}, { capture: true, passive: true });
document.addEventListener('pointerleave', () => { if (video) scheduleHide(); });
window.addEventListener('scroll', position, true);
window.addEventListener('resize', position);
async function loadSettings(): Promise<void> {
  const data = await chrome.storage.local.get({ [PIP_HOVER_ENABLED_KEY]: true, [MODULE_FLAGS_KEY]: {} });
  enabled = data[PIP_HOVER_ENABLED_KEY] !== false && resolveEnabled(data[MODULE_FLAGS_KEY], 'pip');
  if (!enabled) hide();
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PIP_HOVER_ENABLED_KEY] || changes[MODULE_FLAGS_KEY])) void loadSettings(); });
void loadSettings();
