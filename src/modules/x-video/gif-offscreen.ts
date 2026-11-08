import { encodeGif, frameSize } from './gif-encoder';
import { validUrl } from './shared';

export const GIF_CHANNEL = 'lifetools:x-gif-offscreen';
const urls = new Set<string>();
const event = (target: EventTarget, name: string) => new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error('Video timeout')); }, 15000);
  const cleanup = () => { clearTimeout(timer); target.removeEventListener(name, done); target.removeEventListener('error', failed); };
  const done = () => { cleanup(); resolve(); };
  const failed = () => { cleanup(); reject(new Error('Video error')); };
  target.addEventListener(name, done, { once: true }); target.addEventListener('error', failed, { once: true });
});
async function convert(url: string, id: string): Promise<string> {
  if (!validUrl(url)) throw new Error('Invalid URL');
  const response = await fetch(url); if (!response.ok) throw new Error('Fetch failed');
  const source = URL.createObjectURL(await response.blob());
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    const loaded = event(video, 'loadedmetadata'); video.src = source; await loaded;
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Invalid duration');
    const { width, height } = frameSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('Canvas unavailable');
    const total = Math.max(1, Math.ceil(Math.min(video.duration, 15) * 12));
    const frames: Uint8ClampedArray[] = [];
    for (let i = 0; i < total; i++) {
      const seek = event(video, 'seeked'); video.currentTime = Math.min((i + 0.01) / 12, video.duration - 0.0001); await seek;
      context.drawImage(video, 0, 0, width, height); frames.push(context.getImageData(0, 0, width, height).data);
      void chrome.runtime.sendMessage({ channel: GIF_CHANNEL, action: 'progress', id, percent: Math.round((i + 1) / total * 90) }).catch(() => {});
    }
    const data = encodeGif(width, height, frames);
    const result = URL.createObjectURL(new Blob([data as BlobPart], { type: 'image/gif' })); urls.add(result); return result;
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(source); }
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.channel !== GIF_CHANNEL || sender.id !== chrome.runtime.id || sender.tab) return false;
  if (msg.action === 'revoke' && typeof msg.url === 'string' && urls.delete(msg.url)) { URL.revokeObjectURL(msg.url); return false; }
  if (msg.action !== 'convert' || typeof msg.url !== 'string' || typeof msg.id !== 'string') return false;
  void convert(msg.url, msg.id).then(url => respond({ ok: true, url }), () => respond({ ok: false })); return true;
});
