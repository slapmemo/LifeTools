import { showToast } from '../../panel/ui';
import { formatJob, YOUTUBE_BUTTON_KEY, YOUTUBE_ORIGINS, type ToolStatus, type VideoJob } from './logic';
import { videoCall } from './native';
export function initVideoPanel(): { render(): Promise<void> } {
  const root = document.querySelector<HTMLElement>('#video-downloader-panel')!;
  const toggle = root.querySelector<HTMLInputElement>('#video-youtube-enabled')!;
  const status = root.querySelector<HTMLElement>('#video-tools-status')!;
  const list = root.querySelector<HTMLElement>('#video-jobs')!;
  void chrome.storage.local.get({ [YOUTUBE_BUTTON_KEY]: true }).then(async d => { toggle.checked = d[YOUTUBE_BUTTON_KEY] !== false && await chrome.permissions.contains({ origins: YOUTUBE_ORIGINS }); });
  toggle.addEventListener('change', () => { const enabled = toggle.checked; const permission = enabled ? chrome.permissions.request({ origins: YOUTUBE_ORIGINS }) : Promise.resolve(true); void permission.then(async granted => { if (!granted) { toggle.checked = false; showToast('Site izni verilmedi.', 'error'); return; } await chrome.storage.local.set({ [YOUTUBE_BUTTON_KEY]: enabled }); }).catch(() => { toggle.checked = !enabled; }); });
  root.querySelector('#video-tools-install')!.addEventListener('click', () => { void videoCall('video_tools_install').then(() => { showToast('Kurulum başladı. Bir dakika sonra tekrar deneyin.', 'info'); void render(); }).catch(e => showToast(e.message, 'error')); });
  root.querySelector('#video-refresh')!.addEventListener('click', () => { void render(); });
  async function render(): Promise<void> {
    try {
      const [s, j] = await Promise.all([videoCall('video_tools_status'), videoCall('video_jobs')]);
      const tools = s.status as ToolStatus; status.textContent = tools.installing ? 'Araçlar kuruluyor…' : `yt-dlp: ${tools.ytdlp.installed ? tools.ytdlp.version || 'kurulu' : 'kurulu değil'} · ffmpeg: ${tools.ffmpeg ? 'kurulu' : 'kurulu değil'}${tools.error ? ` · ${tools.error}` : ''}`;
      const jobs = j.jobs as VideoJob[];
      list.replaceChildren(...jobs.slice(0, 20).map(job => { const row = document.createElement('li'); const text = document.createElement('span'); text.textContent = `${job.url} — ${formatJob(job)}`; row.append(text); if (job.state === 'running') { const cancel = document.createElement('button'); cancel.textContent = 'İptal'; cancel.addEventListener('click', () => { void videoCall('video_cancel', { jobId: job.id }).then(render).catch(e => showToast(e.message, 'error')); }); row.append(cancel); } return row; }));
      if (!jobs.length) list.textContent = 'Henüz indirme yok.';
    } catch (e) { status.textContent = e instanceof Error ? e.message : 'Durum alınamadı.'; }
  }
  return { render };
}
