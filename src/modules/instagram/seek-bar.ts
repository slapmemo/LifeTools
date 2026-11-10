import { PAGE_THEME } from '../../core/page-theme';
import { visibleVideoRect } from './visibility';

export function formatTime(value: number): string {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const tail = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
}

export function pointerTime(x: number, left: number, width: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(width) || width <= 0 || !Number.isFinite(x) || !Number.isFinite(left)) return 0;
  return Math.max(0, Math.min(1, (x - left) / width)) * duration;
}

export function bufferedPercent(end: number, duration: number): number {
  return Number.isFinite(end) && Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(100, end / duration * 100)) : 0;
}

export function barRect(rect: { left: number; top: number; bottom: number; width: number; height: number }, viewportHeight: number): { left: number; top: number; width: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewportHeight || rect.bottom > viewportHeight) return null;
  return { left: rect.left, top: rect.bottom - 36, width: rect.width };
}

type Bar = { destroy(): void; position(): void };
const bars = new WeakMap<HTMLVideoElement, Bar>();
const videos = new Set<HTMLVideoElement>();
let active = false;
let pointer: { x: number; y: number } | undefined;
let positionFrame = 0;
let scanFrame = 0;
let lastPathname = typeof location === 'undefined' ? '' : location.pathname;

function positionAll(): void { for (const video of videos) bars.get(video)?.position(); }
function schedulePositions(): void {
  if (!positionFrame && videos.size && !document.hidden) positionFrame = requestAnimationFrame(() => {
    positionFrame = 0;
    positionAll();
  });
}

function createBar(video: HTMLVideoElement): Bar {
  const host = document.createElement('div');
  host.dataset.lifetoolsInstagram = '';
  host.style.cssText = 'position:fixed;z-index:2147483647;height:36px;pointer-events:none';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `${PAGE_THEME}
    .wrap{position:relative;width:100%;height:36px;pointer-events:none}
    .label,.tip{position:absolute;bottom:13px;color:white;background:#000a;border-radius:3px;padding:1px 4px;font:12px/1.3 sans-serif;white-space:nowrap}
    .label{left:4px}.tip{display:none;transform:translateX(-50%)}
    .track{position:absolute;bottom:0;left:0;right:0;height:12px;pointer-events:auto;cursor:pointer;touch-action:none}
    .rail,.buffer,.played{position:absolute;bottom:4px;left:0;height:4px;border-radius:3px;pointer-events:none}
    .rail{width:100%;background:#ffffff66}.buffer{background:#ffffff99}.played{background:var(--lt-accent)}
    .track:hover .rail,.track:hover .buffer,.track:hover .played,.track.dragging .rail,.track.dragging .buffer,.track.dragging .played{height:8px;bottom:2px}
    .thumb{position:absolute;bottom:0;width:12px;height:12px;border-radius:50%;background:var(--lt-accent);transform:translateX(-50%);pointer-events:none}
    .track:hover + .tip,.track.dragging + .tip{display:block}.live .track{display:none}`;
  const wrap = document.createElement('div'); wrap.className = 'wrap';
  const label = document.createElement('div'); label.className = 'label';
  const track = document.createElement('div'); track.className = 'track'; track.setAttribute('role', 'slider'); track.setAttribute('aria-label', 'Video ilerleme çubuğu'); track.tabIndex = 0;
  const rail = document.createElement('div'); rail.className = 'rail';
  const buffer = document.createElement('div'); buffer.className = 'buffer';
  const played = document.createElement('div'); played.className = 'played';
  const thumb = document.createElement('div'); thumb.className = 'thumb';
  const tip = document.createElement('div'); tip.className = 'tip';
  track.append(rail, buffer, played, thumb); wrap.append(label, track, tip); root.append(style, wrap); document.documentElement.append(host);
  let frame = 0; let dragging = false; let visible = false;
  const finite = () => Number.isFinite(video.duration) && video.duration > 0;
  function update(): void {
    const duration = video.duration; const valid = finite();
    wrap.classList.toggle('live', !valid);
    label.textContent = valid ? `${formatTime(video.currentTime)} / ${formatTime(duration)}` : formatTime(video.currentTime);
    const percent = bufferedPercent(video.currentTime, duration);
    played.style.width = `${percent}%`; thumb.style.left = `${percent}%`;
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) end = video.buffered.end(i);
    buffer.style.width = `${bufferedPercent(end, duration)}%`;
    track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(valid ? duration : 0)); track.setAttribute('aria-valuenow', String(video.currentTime || 0));
  }
  function tick(): void { frame = 0; if (!visible) return; position(); if (!visible) return; update(); if (!video.paused && !video.ended && !frame) frame = requestAnimationFrame(tick); }
  function play(): void { schedulePositions(); if (visible && !frame) frame = requestAnimationFrame(tick); }
  function pause(): void { if (frame) cancelAnimationFrame(frame); frame = 0; update(); schedulePositions(); }
  function position(): void {
    const rect = visibleVideoRect(video);
    const next = rect ? barRect(rect, innerHeight) : null;
    const display = next ? '' : 'none';
    if (host.style.display !== display) host.style.display = display;
    if (visible !== !!next) {
      visible = !!next;
      if (visible) { update(); if (!video.paused && !video.ended) play(); }
      else if (frame) { cancelAnimationFrame(frame); frame = 0; }
    }
    if (!next) return;
    const left = `${next.left}px`; const top = `${next.top}px`; const width = `${next.width}px`;
    if (host.style.left !== left) host.style.left = left;
    if (host.style.top !== top) host.style.top = top;
    if (host.style.width !== width) host.style.width = width;
  }
  function target(event: PointerEvent, seek: boolean): void {
    const rect = track.getBoundingClientRect(); const time = pointerTime(event.clientX, rect.left, rect.width, video.duration);
    tip.textContent = formatTime(time); tip.style.left = `${Math.max(0, Math.min(rect.width, event.clientX - rect.left))}px`;
    if (seek && finite()) { video.currentTime = time; update(); }
  }
  track.addEventListener('pointerdown', event => { if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); dragging = true; track.classList.add('dragging'); track.setPointerCapture(event.pointerId); target(event, true); });
  track.addEventListener('pointermove', event => { if (dragging) { event.preventDefault(); event.stopPropagation(); } target(event, dragging); });
  const finish = (event: PointerEvent) => { if (!dragging) return; event.preventDefault(); event.stopPropagation(); dragging = false; track.classList.remove('dragging'); if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId); };
  track.addEventListener('pointerup', finish); track.addEventListener('pointercancel', finish);
  for (const name of ['click', 'dblclick']) track.addEventListener(name, event => { event.preventDefault(); event.stopPropagation(); });
  const events = ['timeupdate', 'progress', 'durationchange', 'seeked', 'loadedmetadata'] as const;
  for (const name of events) video.addEventListener(name, update);
  video.addEventListener('play', play); video.addEventListener('pause', pause); video.addEventListener('ended', pause);
  const resize = new ResizeObserver(schedulePositions); resize.observe(video);
  position(); update(); if (!video.paused) play();
  return { position, destroy() { resize.disconnect(); pause(); for (const name of events) video.removeEventListener(name, update); video.removeEventListener('play', play); video.removeEventListener('pause', pause); video.removeEventListener('ended', pause); host.remove(); } };
}

function scan(): void {
  if (location.pathname !== lastPathname) { lastPathname = location.pathname; if (active) positionAll(); }
  for (const video of videos) if (!active || !video.isConnected) { bars.get(video)?.destroy(); bars.delete(video); videos.delete(video); }
  if (!active) { if (positionFrame) cancelAnimationFrame(positionFrame); positionFrame = 0; return; }
  for (const video of document.querySelectorAll('video')) if (!bars.has(video)) { bars.set(video, createBar(video)); videos.add(video); }
  if (!videos.size && positionFrame) { cancelAnimationFrame(positionFrame); positionFrame = 0; }
  schedulePositions();
}
if (typeof document !== 'undefined') {
const observer = new MutationObserver(records => {
  if (!records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof Element) || !node.hasAttribute('data-lifetools-instagram')))) return;
  if (!scanFrame) scanFrame = requestAnimationFrame(() => { scanFrame = 0; scan(); });
});
observer.observe(document, { childList: true, subtree: true });
window.addEventListener('scroll', schedulePositions, true);
window.addEventListener('resize', schedulePositions);
window.addEventListener('popstate', scan);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && positionFrame) { cancelAnimationFrame(positionFrame); positionFrame = 0; }
  else if (!document.hidden) schedulePositions();
});
document.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; }, true);
document.addEventListener('keydown', event => {
  if (!active || !pointer || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || target?.isContentEditable) return;
  const video = [...videos].find(candidate => {
    const raw = candidate.getBoundingClientRect();
    if (pointer!.x < raw.left || pointer!.x > raw.right || pointer!.y < raw.top || pointer!.y > raw.bottom) return false;
    const rect = visibleVideoRect(candidate);
    return rect && pointer!.x >= rect.left && pointer!.x <= rect.right && pointer!.y >= rect.top && pointer!.y <= rect.bottom;
  });
  if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
  video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + (event.key === 'ArrowLeft' ? -5 : 5)));
  event.preventDefault(); event.stopPropagation();
}, true);
}
export function setSeekBarsEnabled(value: boolean): void { active = value; scan(); }
