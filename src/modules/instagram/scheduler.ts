import { clearVisibilityCache } from './visibility';

type Subscriber = (videos: NodeListOf<HTMLVideoElement>, pathnameChanged: boolean) => void;
const subscribers = new Set<Subscriber>();
let frame = 0;
let scrollTimer: ReturnType<typeof setTimeout> | undefined;
let observer: MutationObserver | undefined;
let lastPathname = '';
let pointer: { x: number; y: number } | undefined;

export function scrollSettleDelay(lastScroll: number, now: number): number { return Math.max(0, lastScroll + 300 - now); }
export function getInstagramPointer(): { x: number; y: number } | undefined { return pointer; }
export function scheduleInstagram(): void {
  if (!subscribers.size || frame || document.hidden) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const changed = location.pathname !== lastPathname;
    lastPathname = location.pathname;
    clearVisibilityCache();
    const videos = document.querySelectorAll('video');
    for (const subscriber of subscribers) subscriber(videos, changed);
  });
}
function scroll(): void {
  clearVisibilityCache();
  scheduleInstagram();
  if (scrollTimer !== undefined) clearTimeout(scrollTimer);
  const lastScroll = Date.now();
  scrollTimer = setTimeout(() => { scrollTimer = undefined; scheduleInstagram(); }, scrollSettleDelay(lastScroll, Date.now()));
}
function resize(): void { clearVisibilityCache(); scheduleInstagram(); }
function move(event: PointerEvent): void { pointer = { x: event.clientX, y: event.clientY }; }
function visibility(): void {
  if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; }
  else scheduleInstagram();
}
export function subscribeInstagram(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  if (subscribers.size === 1) {
    lastPathname = location.pathname;
    observer = new MutationObserver(records => {
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => !(node instanceof Element) || !node.hasAttribute('data-lifetools-instagram')))) scheduleInstagram();
    });
    observer.observe(document, { childList: true, subtree: true });
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', resize);
    window.addEventListener('popstate', scheduleInstagram);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('visibilitychange', visibility);
  }
  scheduleInstagram();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size) return;
    observer?.disconnect(); observer = undefined;
    window.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', resize);
    window.removeEventListener('popstate', scheduleInstagram);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('visibilitychange', visibility);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (scrollTimer !== undefined) clearTimeout(scrollTimer);
    scrollTimer = undefined; pointer = undefined;
  };
}
