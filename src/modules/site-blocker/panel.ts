import { MAX_HANDLES, normalizeHandle } from './rules';
import { loadSettings } from './settings';

function $<T extends HTMLElement>(selector: string): T {
  return document.querySelector(selector) as T;
}

/** Popup içindeki site engelleyici paneli (prototip popup'ından taşındı). */
export function initBlockerPanel(): { render(): Promise<void> } {
  const dom = {
    enabled: $<HTMLInputElement>('#blocker-enabled'),
    pill: $<HTMLElement>('#state-pill'),
    pillText: $<HTMLElement>('#state-pill-text'),
    statusTitle: $<HTMLElement>('#status-title'),
    statusDescription: $<HTMLElement>('#status-description'),
    form: $<HTMLFormElement>('#add-form'),
    input: $<HTMLInputElement>('#handle-input'),
    addButton: $<HTMLButtonElement>('#add-button'),
    feedback: $<HTMLElement>('#feedback'),
    count: $<HTMLElement>('#count'),
    empty: $<HTMLElement>('#empty'),
    list: $<HTMLElement>('#handle-list')
  };

  let busy = false;

  function showFeedback(message: string, type: 'error' | 'success' = 'error'): void {
    dom.feedback.textContent = message;
    dom.feedback.className = `feedback ${type}`;
  }

  function setBusy(value: boolean): void {
    busy = value;
    dom.addButton.disabled = value;
  }

  async function render(): Promise<void> {
    try {
      const { enabled, blockedHandles } = await loadSettings();
      dom.enabled.checked = enabled;
      dom.pill.classList.toggle('paused', !enabled);
      dom.pillText.textContent = enabled ? ' Aktif' : ' Duraklatıldı';
      dom.statusTitle.textContent = enabled ? 'Koruma açık' : 'Koruma kapalı';
      dom.statusDescription.textContent = enabled
        ? 'Engellediğin profiller otomatik kapanır.'
        : 'Engelli profillere geçici olarak girebilirsin.';
      dom.count.textContent = String(blockedHandles.length);
      dom.empty.hidden = blockedHandles.length > 0;
      dom.list.replaceChildren();

      for (const handle of blockedHandles) {
        const item = document.createElement('li');
        const avatar = document.createElement('span');
        avatar.className = 'profile-icon';
        avatar.textContent = '@';
        avatar.setAttribute('aria-hidden', 'true');

        const name = document.createElement('span');
        name.className = 'handle-name';
        name.textContent = `@${handle}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'delete-button';
        remove.textContent = '×';
        remove.title = `@${handle} engelini kaldır`;
        remove.setAttribute('aria-label', `@${handle} engelini kaldır`);
        remove.addEventListener('click', () => { void deleteHandle(handle); });

        item.append(avatar, name, remove);
        dom.list.append(item);
      }
    } catch {
      showFeedback('Ayarlar yüklenemedi. Eklentiyi yeniden açmayı dene.');
    }
  }

  async function deleteHandle(handle: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const { blockedHandles } = await loadSettings();
      await chrome.storage.local.set({
        blockedHandles: blockedHandles.filter(item => item !== handle)
      });
      showFeedback(`@${handle} engeli kaldırıldı.`, 'success');
      await render();
    } catch {
      showFeedback('Profil silinemedi. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  dom.form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const handle = normalizeHandle(dom.input.value);
    if (!handle) {
      showFeedback('Geçerli bir X kullanıcı adı veya profil bağlantısı gir.');
      dom.input.focus();
      return;
    }

    setBusy(true);
    try {
      const { blockedHandles } = await loadSettings();
      if (blockedHandles.includes(handle)) {
        showFeedback(`@${handle} zaten listede.`);
        return;
      }
      if (blockedHandles.length >= MAX_HANDLES) {
        showFeedback(`En fazla ${MAX_HANDLES} profil ekleyebilirsin.`);
        return;
      }
      await chrome.storage.local.set({ blockedHandles: [handle, ...blockedHandles] });
      dom.input.value = '';
      showFeedback(`@${handle} engellendi.`, 'success');
      await render();
    } catch {
      showFeedback('Profil kaydedilemedi. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  });

  dom.enabled.addEventListener('change', async () => {
    try {
      await chrome.storage.local.set({ enabled: dom.enabled.checked });
      showFeedback(dom.enabled.checked ? 'Koruma açıldı.' : 'Koruma duraklatıldı.', 'success');
      await render();
    } catch {
      showFeedback('Koruma durumu güncellenemedi.');
      await render();
    }
  });

  return { render };
}
