import { extractVideoMedia } from './extract';
import { CHANNEL, mayContainXVideo } from './shared';
function capture(json: unknown): void { try { for (const media of extractVideoMedia(json)) window.postMessage({ source: CHANNEL, media }, location.origin); } catch { /* Page behavior must remain unchanged. */ } }
function api(url: string): boolean { try { const u = new URL(url, location.href); return /(^|\.)(x|twitter)\.com$/.test(u.hostname) && /\/(graphql|api|1\.1|2)\//i.test(u.pathname); } catch { return false; } }
let active = false;
window.addEventListener('message', event => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== CHANNEL || event.data.type !== 'hook-enabled' || typeof event.data.enabled !== 'boolean') return;
  active = event.data.enabled;
});
const originalFetch = window.fetch;
window.fetch = function (...args) { if (!active) return originalFetch.apply(this, args); const result = originalFetch.apply(this, args); try { const request = args[0]; const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url; if (api(url)) void result.then(response => { try { const type = response.headers.get('content-type'); if (type !== null && !/json|javascript|text/i.test(type)) return; void response.clone().text().then(text => { try { if (text.length <= 15_000_000 && mayContainXVideo(text)) capture(JSON.parse(text)); } catch {} }).catch(() => {}); } catch {} }).catch(() => {}); } catch {} return result; };
const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof open>) { try { if (active && api(String(args[1]))) this.addEventListener('load', () => { try { if (!active) return; if (this.responseType === 'json') capture(this.response); else if (!this.responseType || this.responseType === 'text') { const text = this.responseText; if (mayContainXVideo(text)) capture(JSON.parse(text)); } } catch {} }); } catch {} return open.apply(this, args); } as typeof open;
