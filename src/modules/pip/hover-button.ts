import { pageToast } from '../../core/page-toast';
import { MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { PIP_HOVER_ENABLED_KEY, pipButtonPosition } from './hover-logic';

let enabled = false;
let video: HTMLVideoElement | undefined;
let host: HTMLElement | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function hide(): void { clearTimeout(timer); host?.remove(); host = undefined; video = undefined; }
function scheduleHide(): void { clearTimeout(timer); timer = setTimeout(hide, 1500); }
function eligible(v: HTMLVideoElement): boolean {
  const r = v.getBoundingClientRect();
  return !v.disablePictureInPicture && r.width >= 200 && r.height >= 120 && (!v.paused || !!v.currentSrc || !!v.src || !!v.srcObject || !!v.querySelector('source[src]'));
}
function position(): void {
  if (!host || !video) return;
  if (!video.isConnected || !eligible(video)) { hide(); return; }
  const pos = pipButtonPosition(video.getBoundingClientRect(), location.hostname);
  host.style.left = `${pos.left}px`; host.style.top = `${pos.top}px`;
}
function show(v: HTMLVideoElement): void {
  if (!enabled || !eligible(v)) return;
  clearTimeout(timer);
  if (video === v && host) { position(); return; }
  hide(); video = v;
  host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = ':host{all:initial;position:fixed;z-index:2147483647}button{width:32px;height:32px;border:0;border-radius:50%;background:#20242bd9;color:white;font:22px system-ui;cursor:pointer;box-shadow:0 2px 8px #0006}button:hover{background:#000}';
  const button = document.createElement('button'); button.type = 'button'; button.title = 'Resim içinde resim'; button.setAttribute('aria-label', button.title); button.textContent = '⧉';
  button.addEventListener('click', () => {
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
document.addEventListener('mouseover', event => { if (event.target instanceof HTMLVideoElement) show(event.target); }, true);
document.addEventListener('mouseout', event => { if (event.target === video) scheduleHide(); }, true);
window.addEventListener('scroll', position, true);
window.addEventListener('resize', position);
async function loadSettings(): Promise<void> {
  const data = await chrome.storage.local.get({ [PIP_HOVER_ENABLED_KEY]: false, [MODULE_FLAGS_KEY]: {} });
  enabled = data[PIP_HOVER_ENABLED_KEY] === true && resolveEnabled(data[MODULE_FLAGS_KEY], 'pip');
  if (!enabled) hide();
}
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PIP_HOVER_ENABLED_KEY] || changes[MODULE_FLAGS_KEY])) void loadSettings(); });
void loadSettings();
