import { requestRunAction } from '../../core/actions';
import { resolveEnabled } from '../../core/module-state';
import { PIP_ID } from '../../modules/pip/background';
import { PIP_HOVER_ENABLED_KEY, PIP_HOVER_ORIGINS } from '../../modules/pip/hover-logic';
import { showToast } from '../ui';

/** PiP ayar bölümünü bağlar; refresh sırasında çağrılacak güncelleme fonksiyonunu döndürür. */
export function initPipSettings(): (flags: unknown) => Promise<void> {
  const pipSection = document.querySelector('#pip-panel') as HTMLElement;
  const pipFeedback = document.querySelector('#pip-feedback') as HTMLElement;
  const pipShortcutHint = document.getElementById('pip-shortcut-hint');
  const pipShortcutChange = document.getElementById('pip-shortcut-change');
  const pipHover = document.querySelector<HTMLInputElement>('#pip-hover-enabled')!;
  pipHover.addEventListener('change', () => {
    const requested = pipHover.checked;
    const permission = requested ? chrome.permissions.request({ origins: PIP_HOVER_ORIGINS }) : Promise.resolve(true);
    void permission.then(async granted => {
      if (!granted) { pipHover.checked = false; showToast('Site izni verilmedi.', 'error'); return; }
      await chrome.storage.local.set({ [PIP_HOVER_ENABLED_KEY]: requested });
    }).catch(() => { pipHover.checked = !requested; showToast('Ayar kaydedilemedi.', 'error'); });
  });

  document.querySelector('#pip-toggle')!.addEventListener('click', () => {
    void (async () => {
      const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      const result = await requestRunAction('pip.toggle', undefined, tab?.id);
      const msg = result.message ?? (result.ok ? 'İşlem tamamlandı.' : 'İşlem başarısız.');
      pipFeedback.textContent = msg;
      pipFeedback.hidden = false;
      showToast(msg, result.ok ? 'info' : 'error');
    })();
  });

  pipShortcutChange?.addEventListener('click', () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  async function refreshPipShortcut(): Promise<void> {
    if (!pipShortcutHint || !chrome.commands?.getAll) return;
    try {
      const cmds = await chrome.commands.getAll();
      const pipCmd = cmds.find(c => c.name === 'toggle-pip');
      const key = pipCmd?.shortcut?.trim();
      pipShortcutHint.textContent = `Kısayol: ${key || 'Atanmamış'}`;
    } catch {
      pipShortcutHint.textContent = 'Kısayol: Atanmamış';
    }
  }

  return async (flags: unknown): Promise<void> => {
    pipSection.hidden = !resolveEnabled(flags, PIP_ID);
    if (!pipSection.hidden) {
      await refreshPipShortcut();
      const data = await chrome.storage.local.get({ [PIP_HOVER_ENABLED_KEY]: true });
      pipHover.checked = data[PIP_HOVER_ENABLED_KEY] !== false && await chrome.permissions.contains({ origins: PIP_HOVER_ORIGINS });
    }
  };
}
