import { extractVideoMedia } from './extract';
import { CHANNEL } from './shared';
function capture(json: unknown): void { try { for (const media of extractVideoMedia(json)) window.postMessage({ source: CHANNEL, media }, location.origin); } catch { /* Page behavior must remain unchanged. */ } }
function api(url: string): boolean { try { const u = new URL(url, location.href); return /(^|\.)(x|twitter)\.com$/.test(u.hostname) && /\/(graphql|api|1\.1|2)\//i.test(u.pathname); } catch { return false; } }
const originalFetch = window.fetch;
window.fetch = function (...args) { const result = originalFetch.apply(this, args); try { const request = args[0]; const url = typeof request === 'string' ? request : request instanceof URL ? request.href : request.url; if (api(url)) void result.then(response => { try { void response.clone().json().then(capture).catch(() => {}); } catch {} }).catch(() => {}); } catch {} return result; };
const open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<typeof open>) { try { if (api(String(args[1]))) this.addEventListener('load', () => { try { if (this.responseType === 'json') capture(this.response); else if (!this.responseType || this.responseType === 'text') capture(JSON.parse(this.responseText)); } catch {} }); } catch {} return open.apply(this, args); } as typeof open;
