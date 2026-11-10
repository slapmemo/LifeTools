import { applyTheme } from '../../core/theme';

/** Temayı uygular ve tema seçici düğmelerini bağlar. */
export function initTheme(): void {
  void applyTheme();
  const themeSelect = document.querySelector('#theme-select') as HTMLSelectElement;
  const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');

  function syncThemeUi(value: string): void {
    themeSelect.value = value;
    themeButtons.forEach(btn => {
      const active = btn.dataset.themeValue === value;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  void chrome.storage.local.get({ ui_theme: 'system' }).then(data => {
    syncThemeUi(String(data.ui_theme || 'system'));
  });

  themeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.themeValue ?? 'system';
      syncThemeUi(value);
      void chrome.storage.local.set({ ui_theme: value }).then(applyTheme);
    });
  });

  themeSelect.addEventListener('change', () => {
    syncThemeUi(themeSelect.value);
    void chrome.storage.local.set({ ui_theme: themeSelect.value }).then(applyTheme);
  });
}
