import { describeCommands } from './duplicates';

function $<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

export function initShortcutsPanel(): { render(): Promise<void> } {
  const list = $<HTMLElement>('shortcuts-list'), warning = $<HTMLElement>('shortcuts-warning');
  $<HTMLButtonElement>('shortcuts-open').addEventListener('click', () => { void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); });
  async function render(): Promise<void> {
    const rows = describeCommands(await chrome.commands.getAll());
    list.replaceChildren(...rows.map(row => {
      const li = document.createElement('li'); li.className = 'memo-item';
      const title = document.createElement('strong'); title.textContent = row.description;
      const keys = document.createElement('p'); keys.className = 'hint';
      keys.textContent = row.assigned ? row.shortcut : 'Atanmamış';
      if (row.duplicate) keys.textContent += ' · ⚠ Çakışıyor';
      li.append(title, keys);
      return li;
    }));
    const duplicates = rows.filter(r => r.duplicate);
    warning.textContent = duplicates.length ? `Uyarı: ${duplicates.map(r => r.description).join(', ')} aynı kısayolu paylaşıyor.` : '';
    warning.hidden = !duplicates.length;
  }
  return { render };
}
