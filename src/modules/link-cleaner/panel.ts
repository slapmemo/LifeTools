import { showToast } from '../../panel/ui';
import { cleanUrl } from './clean';
import { AUTO_CLEAN_KEY, AUTO_CLEAN_ORIGINS } from './rules';
import { SHORT_LINK_KEY, SHORT_LINK_PERMISSION_ORIGINS } from './shorteners';

type Result = ReturnType<typeof cleanUrl>;

export function initLinkCleanerPanel(): { render(): Promise<void> } {
  const input = document.querySelector('#cleaner-input') as HTMLInputElement;
  const activeOutput = document.querySelector('#cleaner-active-output') as HTMLElement;
  const inputOutput = document.querySelector('#cleaner-input-output') as HTMLElement;
  const activeCount = document.querySelector('#cleaner-active-count') as HTMLElement;
  const inputCount = document.querySelector('#cleaner-input-count') as HTMLElement;
  const activeChips = document.querySelector<HTMLElement>('#cleaner-active-chips');
  const inputChips = document.querySelector<HTMLElement>('#cleaner-input-chips');
  const activeCopy = document.querySelector('#cleaner-active-copy') as HTMLButtonElement;
  const inputCopy = document.querySelector('#cleaner-input-copy') as HTMLButtonElement;
  const feedback = document.querySelector('#cleaner-feedback') as HTMLElement;
  const autoToggle = document.querySelector('#cleaner-auto-enabled') as HTMLInputElement;
  const shortToggle = document.querySelector('#cleaner-short-enabled') as HTMLInputElement;
  shortToggle.addEventListener('change', () => {
    const enabled = shortToggle.checked;
    const permission = enabled ? chrome.permissions.request({ origins: SHORT_LINK_PERMISSION_ORIGINS }) : Promise.resolve(true);
    void permission.then(async granted => {
      if (!granted) { shortToggle.checked = false; showToast('Site izni verilmedi.', 'error'); return; }
      await chrome.storage.local.set({ [SHORT_LINK_KEY]: enabled });
    }).catch(() => { shortToggle.checked = !enabled; showToast('Ayar kaydedilemedi.', 'error'); });
  });
  autoToggle.addEventListener('change', () => {
    const enabled = autoToggle.checked;
    const permission = enabled ? chrome.permissions.request({ origins: AUTO_CLEAN_ORIGINS }) : Promise.resolve(true);
    void permission.then(async granted => {
      if (!granted) { autoToggle.checked = false; showToast('Site izni verilmedi.', 'error'); return; }
      await chrome.storage.local.set({ [AUTO_CLEAN_KEY]: enabled });
    }).catch(() => { autoToggle.checked = !enabled; showToast('Ayar kaydedilemedi.', 'error'); });
  });
  let active: Result = null;
  let pasted: Result = null;

  function show(
    result: Result,
    output: HTMLElement,
    count: HTMLElement,
    chips: HTMLElement | null,
    button: HTMLButtonElement,
    empty: string
  ): void {
    output.textContent = result?.url ?? empty;
    output.classList.toggle('muted', !result);
    count.textContent = result
      ? result.removed.length
        ? `${result.removed.length} takip parametresi kaldırıldı:`
        : 'Kaldırılacak takip parametresi yok.'
      : '';
    if (chips) {
      chips.replaceChildren(
        ...(result?.removed ?? []).map(param => {
          const span = document.createElement('code');
          span.className = 'chip chip-mono chip-danger';
          span.textContent = param;
          return span;
        })
      );
      chips.hidden = !result || result.removed.length === 0;
    }
    button.disabled = !result;
  }

  async function copy(result: Result): Promise<void> {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      feedback.textContent = 'Kopyalandı.';
      showToast('Temiz link kopyalandı.', 'info');
    } catch {
      feedback.textContent = 'Kopyalanamadı. Tekrar dene.';
      showToast('Kopyalanamadı. Tekrar dene.', 'error');
    }
  }

  activeCopy.addEventListener('click', () => {
    void copy(active);
  });
  inputCopy.addEventListener('click', () => {
    void copy(pasted);
  });
  input.addEventListener('input', () => {
    pasted = cleanUrl(input.value.trim());
    show(
      pasted,
      inputOutput,
      inputCount,
      inputChips,
      inputCopy,
      input.value.trim() ? 'Geçerli bir HTTP veya HTTPS linki gir.' : 'Temiz link burada görünür.'
    );
    feedback.textContent = '';
  });

  return {
    async render() {
      const settings = await chrome.storage.local.get({ [AUTO_CLEAN_KEY]: true, [SHORT_LINK_KEY]: true });
      autoToggle.checked = settings[AUTO_CLEAN_KEY] !== false && await chrome.permissions.contains({ origins: AUTO_CLEAN_ORIGINS });
      shortToggle.checked = settings[SHORT_LINK_KEY] !== false && await chrome.permissions.contains({ origins: SHORT_LINK_PERMISSION_ORIGINS });
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        active = cleanUrl(tab?.url ?? '');
      } catch {
        active = null;
      }
      show(active, activeOutput, activeCount, activeChips, activeCopy, 'Bu sayfanın linki kullanılamıyor.');
    }
  };
}
