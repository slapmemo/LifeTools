import { icon } from '../../../design/icons';
import { loadSubfolder, sanitizeDownloadFolder, SUBFOLDER_KEY } from '../../core/download-path';
import { resolveEnabled } from '../../core/module-state';
import { defaults as instagramDefaults, SETTINGS_KEY as INSTAGRAM_SETTINGS_KEY, INSTAGRAM_ID } from '../../modules/instagram/shared';
import { VIDEO_ID } from '../../modules/video-downloader/logic';
import { defaults as xVideoDefaults, SETTINGS_KEY as X_VIDEO_SETTINGS_KEY, X_VIDEO_ID } from '../../modules/x-video/shared';
import { showToast } from '../ui';

/** X Video / Instagram / video indirici ayarlarını bağlar; refresh sırasında çağrılacak fonksiyonu döndürür. */
export function initMediaSettings(videoPanel: { render: () => unknown }): (flags: unknown) => Promise<void> {
  const xVideoPanel = document.querySelector('#x-video-panel') as HTMLElement;
  const instagramPanel = document.querySelector('#instagram-panel') as HTMLElement;
  const instagramDownload = document.querySelector('#instagram-download') as HTMLInputElement;
  const instagramSeek = document.querySelector('#instagram-seek') as HTMLInputElement;
  const instagramSpeed = document.querySelector('#instagram-speed') as HTMLInputElement;
  for (const control of [instagramDownload, instagramSeek, instagramSpeed]) control.addEventListener('change', () => {
    void chrome.storage.local.get({ [INSTAGRAM_SETTINGS_KEY]: instagramDefaults }).then(data => chrome.storage.local.set({ [INSTAGRAM_SETTINGS_KEY]: { ...data[INSTAGRAM_SETTINGS_KEY], downloadButton: instagramDownload.checked, seekBar: instagramSeek.checked, speedControl: instagramSpeed.checked } }));
  });
  const xVideoStatus = document.getElementById('x-video-status');
  const xVideoHowtoIcon = document.getElementById('x-video-howto-icon');
  if (xVideoHowtoIcon) xVideoHowtoIcon.replaceChildren(icon('clapperboard', 18));

  const xAskQuality = document.querySelector('#x-video-ask-quality') as HTMLInputElement;
  const xDownloadFolder = document.querySelector('#x-video-download-folder') as HTMLInputElement;
  for (const control of [xAskQuality, xDownloadFolder]) {
    control.addEventListener('change', () => {
      xDownloadFolder.value = sanitizeDownloadFolder(xDownloadFolder.value);
      void chrome.storage.local.get({ [X_VIDEO_SETTINGS_KEY]: xVideoDefaults }).then(data => chrome.storage.local
        .set({
          [X_VIDEO_SETTINGS_KEY]: {
            ...data[X_VIDEO_SETTINGS_KEY],
            askQuality: xAskQuality.checked
          },
          [SUBFOLDER_KEY]: xDownloadFolder.value
        }))
        .then(() => showToast('X Video İndirici ayarları kaydedildi.', 'info'));
    });
  }

  return async (flags: unknown): Promise<void> => {
    const xEnabled = resolveEnabled(flags, X_VIDEO_ID);
    const videoEnabled = resolveEnabled(flags, VIDEO_ID);
    (document.querySelector('#video-downloader-panel') as HTMLElement).hidden = !videoEnabled;
    if (videoEnabled) void videoPanel.render();
    instagramPanel.hidden = !resolveEnabled(flags, INSTAGRAM_ID);
    const instagramData = await chrome.storage.local.get({ [INSTAGRAM_SETTINGS_KEY]: instagramDefaults });
    const instagramSettings = { ...instagramDefaults, ...instagramData[INSTAGRAM_SETTINGS_KEY] };
    instagramDownload.checked = instagramSettings.downloadButton;
    instagramSeek.checked = instagramSettings.seekBar;
    instagramSpeed.checked = instagramSettings.speedControl;
    xVideoPanel.hidden = !xEnabled;
    if (xVideoStatus) xVideoStatus.textContent = xEnabled ? 'Etkin' : 'Kapalı';

    const xData = await chrome.storage.local.get({ [X_VIDEO_SETTINGS_KEY]: xVideoDefaults });
    const xSettings = { ...xVideoDefaults, ...xData[X_VIDEO_SETTINGS_KEY] };
    xAskQuality.checked = xSettings.askQuality;
    xDownloadFolder.value = await loadSubfolder();
  };
}
