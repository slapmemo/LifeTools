import { setContextMenuContributions } from '../../core/context-menu';
import { isModuleEnabled, MODULE_FLAGS_KEY, resolveEnabled } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { acceptsUrl, MODE_LABELS, VIDEO_ID, YOUTUBE_BUTTON_KEY, YOUTUBE_ORIGINS, youtubePlaylistId, type VideoJob, type VideoMode } from './logic';
import { videoCall, UNREACHABLE } from './native';

const KEY = 'videoDownloadJobs';
const ALARM = 'video-download-poll';
const INSTALL = 'video-download-install';
let trackingQueue: Promise<void> = Promise.resolve();
function belongsToPage(job: VideoJob, page: string | undefined): boolean { if (!page) return false; if (job.url === page) return true; const id = youtubePlaylistId(page); return !!id && job.mode.startsWith('playlist:') && job.url === `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`; }
function updateTracked(update: (ids: string[]) => string[]): Promise<void> {
  const next = trackingQueue.then(async () => { await chrome.storage.session.set({ [KEY]: update(await tracked()) }); });
  trackingQueue = next.catch(() => {}); return next;
}
async function notify(id: string, message: string, buttons?: chrome.notifications.ButtonOptions[]): Promise<void> { await chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title: 'Video İndirici', message, ...(buttons ? { buttons } : {}) }); }
async function tracked(): Promise<string[]> { const data = await chrome.storage.session.get({ [KEY]: [] }); return Array.isArray(data[KEY]) ? data[KEY] : []; }
export async function startDownload(url: string, mode: VideoMode = 'video_best'): Promise<string> {
  if (!acceptsUrl(url)) { const message = 'Yalnızca HTTP veya HTTPS bağlantıları indirilebilir.'; await notify('video-error', message); throw new Error(message); }
  try {
    const picked = await videoCall('video_pick_folder');
    if (!picked.path) return 'İndirme iptal edildi.';
    const result = await videoCall('video_download', { url, mode, dir: picked.path });
    await updateTracked(ids => [...ids, String(result.jobId)]);
    await chrome.alarms.create(ALARM, { delayInMinutes: 0.025 });
    return 'İndirme başlatıldı.';
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (err.name === 'TOOLS_MISSING') await notify(INSTALL, 'İndirme araçları kurulu değil.', [{ title: 'Araçları kur' }]);
    else await notify('video-error', err.message);
    throw err;
  }
}
async function poll(): Promise<void> {
  const ids = await tracked(); const finished: string[] = [];
  for (const id of ids) {
    try {
      const job = (await videoCall('video_job', { jobId: id })).job as VideoJob;
      if (job.state !== 'running') { if (job.state === 'done') await notify(`video-${id}`, `İndirildi: ${(job.file || '').split(/[\\/]/).pop() || 'dosya'}`); finished.push(id); }
    } catch { /* Bağlantı döndüğünde yeniden dene. */ }
  }
  await updateTracked(current => current.filter(id => !finished.includes(id)));
  if ((await tracked()).length) await chrome.alarms.create(ALARM, { delayInMinutes: 0.025 });
}
export function initVideoBackground(): void {
  const refresh = () => { void (async () => { const data = await chrome.storage.local.get({ [YOUTUBE_BUTTON_KEY]: true }); const active = data[YOUTUBE_BUTTON_KEY] !== false && await isModuleEnabled(VIDEO_ID); await replaceSiteScript('video-downloader-youtube', active ? YOUTUBE_ORIGINS : [], 'video-downloader-youtube.js', false); })().catch(console.debug); };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[YOUTUBE_BUTTON_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
  chrome.permissions.onAdded.addListener(refresh); chrome.permissions.onRemoved.addListener(refresh); chrome.runtime.onInstalled.addListener(refresh); chrome.runtime.onStartup.addListener(refresh); refresh();
  setContextMenuContributions(VIDEO_ID, [
    { id: 'video:page', title: 'Bu sayfadaki videoyu indir', contexts: ['page'], moduleId: VIDEO_ID, enabled: f => resolveEnabled(f, VIDEO_ID), onClick: async (info, tab) => { try { await startDownload(info.pageUrl || tab?.url || ''); } catch {} } },
    { id: 'video:link', title: 'Bağlantıdaki videoyu indir', contexts: ['link'], moduleId: VIDEO_ID, enabled: f => resolveEnabled(f, VIDEO_ID), onClick: async info => { try { await startDownload(info.linkUrl || ''); } catch {} } }
  ]);
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM) void poll(); });
  chrome.notifications.onButtonClicked.addListener((id) => { if (id === INSTALL) void videoCall('video_tools_install').then(() => notify(INSTALL, 'Kurulum başladı. Bir dakika sonra tekrar deneyin.')).catch(e => notify(INSTALL, e instanceof Error ? e.message : UNREACHABLE)); });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (sender.tab && (msg?.type === 'video-downloader:jobs' || msg?.type === 'video-downloader:cancel')) {
      void (async () => {
        if (!await isModuleEnabled(VIDEO_ID)) throw new Error('Modül kapalı.');
        const jobs = (await videoCall('video_jobs')).jobs as VideoJob[];
        if (msg.type === 'video-downloader:cancel') {
          if (!jobs.some(job => job.id === msg.jobId && belongsToPage(job, sender.tab?.url) && job.state === 'running')) throw new Error('Geçersiz iş.');
          await videoCall('video_cancel', { jobId: msg.jobId });
        }
        return jobs.filter(job => belongsToPage(job, sender.tab?.url));
      })().then(jobs => respond({ ok: true, jobs })).catch(e => respond({ ok: false, message: e.message }));
      return true;
    }
    if (!sender.tab) return;
    if (msg?.type === 'video-downloader:formats' || msg?.type === 'video-downloader:install') {
      void (async () => { if (!await isModuleEnabled(VIDEO_ID)) throw new Error('Modül kapalı.'); if (msg.type === 'video-downloader:install') return videoCall('video_tools_install'); if (typeof msg.url !== 'string' || msg.url !== sender.tab?.url || !acceptsUrl(msg.url)) throw new Error('Geçersiz istek.'); return videoCall('video_formats', { url: msg.url }); })().then(data => respond({ ok: true, data })).catch(e => respond({ ok: false, message: e.message, code: e.name })); return true;
    }
    if (msg?.type !== 'video-downloader:start') return;
    void (async () => { if (!await isModuleEnabled(VIDEO_ID)) throw new Error('Modül kapalı.'); const height = typeof msg.mode === 'string' && /^height:\d+$/.test(msg.mode) ? Number(msg.mode.slice(7)) : 0; const id = sender.tab?.url ? youtubePlaylistId(sender.tab.url) : null; const playlist = typeof msg.mode === 'string' && msg.mode.startsWith('playlist:'); const validUrl = playlist ? !!id && msg.url === `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}` : msg.url === sender.tab?.url; if (!(typeof msg.mode === 'string' && (Object.hasOwn(MODE_LABELS, msg.mode) || (height >= 144 && height <= 4320))) || typeof msg.url !== 'string' || !validUrl) throw new Error('Geçersiz istek.'); return startDownload(msg.url, msg.mode as VideoMode); })().then(message => respond({ ok: true, message })).catch(e => respond({ ok: false, message: e.message })); return true;
  });
  void tracked().then(ids => { if (ids.length) return chrome.alarms.create(ALARM, { delayInMinutes: 0.025 }); });
}
