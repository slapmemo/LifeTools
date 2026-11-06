import { cleanUrl } from './clean';

type Result = ReturnType<typeof cleanUrl>;
export function initLinkCleanerPanel(): { render(): Promise<void> } {
  const input = document.querySelector('#cleaner-input') as HTMLInputElement;
  const activeOutput = document.querySelector('#cleaner-active-output') as HTMLElement;
  const inputOutput = document.querySelector('#cleaner-input-output') as HTMLElement;
  const activeCount = document.querySelector('#cleaner-active-count') as HTMLElement;
  const inputCount = document.querySelector('#cleaner-input-count') as HTMLElement;
  const activeCopy = document.querySelector('#cleaner-active-copy') as HTMLButtonElement;
  const inputCopy = document.querySelector('#cleaner-input-copy') as HTMLButtonElement;
  const feedback = document.querySelector('#cleaner-feedback') as HTMLElement;
  let active: Result = null;
  let pasted: Result = null;

  function show(result: Result, output: HTMLElement, count: HTMLElement, button: HTMLButtonElement, empty: string): void {
    output.textContent = result?.url ?? empty;
    count.textContent = result ? `${result.removed.length} parametre kaldırıldı.` : '';
    button.disabled = !result;
  }
  async function copy(result: Result): Promise<void> {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.url); feedback.textContent = 'Kopyalandı.'; }
    catch { feedback.textContent = 'Kopyalanamadı. Tekrar dene.'; }
  }
  activeCopy.addEventListener('click', () => { void copy(active); });
  inputCopy.addEventListener('click', () => { void copy(pasted); });
  input.addEventListener('input', () => {
    pasted = cleanUrl(input.value.trim());
    show(pasted, inputOutput, inputCount, inputCopy, input.value.trim() ? 'Geçerli bir HTTP veya HTTPS linki gir.' : 'Temiz link burada görünür.');
    feedback.textContent = '';
  });
  return { async render() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      active = cleanUrl(tab?.url ?? '');
    } catch { active = null; }
    show(active, activeOutput, activeCount, activeCopy, 'Bu sayfanın linki kullanılamıyor.');
  } };
}
