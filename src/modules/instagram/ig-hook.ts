import { extractMedia } from './extract';
import { CHANNEL, mayContainInstagramVideo } from './shared';
function capture(json: unknown): void { try { for (const media of extractMedia(json)) window.postMessage({ source: CHANNEL, media }, location.origin); } catch {} }
function api(url: string): boolean { try { const u = new URL(url, location.href); return /(^|\.)instagram\.com$/.test(u.hostname) && (/\/graphql/i.test(u.pathname) || /\/api\/v1\//i.test(u.pathname) || /\/api\/graphql/i.test(u.pathname)); } catch { return false; } }
let active = false;
const originalFetch = window.fetch;
window.fetch = function (...args) { if (!active) return originalFetch.apply(this, args); const result = originalFetch.apply(this, args); try { const request = args[0]; const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url; if (api(url)) void result.then(response => { try { const type = response.headers.get('content-type'); if (type !== null && !/json|javascript|text/i.test(type)) return; void response.clone().text().then(text => { try { if (text.length <= 15_000_000 && mayContainInstagramVideo(text)) capture(JSON.parse(text)); } catch {} }).catch(() => {}); } catch {} }).catch(() => {}); } catch {} return result; };
const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof open>) { try { if (active && api(String(args[1]))) this.addEventListener('load', () => { try { if (!active) return; if (this.responseType === 'json') capture(this.response); else if (!this.responseType || this.responseType === 'text') { const text = this.responseText; if (mayContainInstagramVideo(text)) capture(JSON.parse(text)); } } catch {} }); } catch {} return open.apply(this, args); } as typeof open;
function scan(): void { if (!active) return; for (const script of document.querySelectorAll('script[type="application/json"]')) { try { const text = script.textContent ?? ''; if (mayContainInstagramVideo(text)) capture(JSON.parse(text)); } catch {} } }
function scheduleScan(): void { if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(scan); else window.setTimeout(scan, 0); }
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== CHANNEL || event.data.type !== 'hook-enabled' || typeof event.data.enabled !== 'boolean') return;
  const was = active; active = event.data.enabled;
  if (active && !was) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleScan, { once: true }); else scheduleScan(); }
});
