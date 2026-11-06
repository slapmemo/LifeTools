import { showToast } from '../../panel/ui';
import { cleanUrl } from './clean';

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
