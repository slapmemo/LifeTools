import { describeCommands } from './duplicates';

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function initShortcutsPanel(): { render(): Promise<void> } {
  const list = $<HTMLElement>('shortcuts-list');
  const warning = $<HTMLElement>('shortcuts-warning');

  $<HTMLButtonElement>('shortcuts-open').addEventListener('click', () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  async function render(): Promise<void> {
    const rows = describeCommands(await chrome.commands.getAll());
    const isTableBody = list.tagName === 'TBODY';

    list.replaceChildren(
      ...rows.map(row => {
        if (isTableBody) {
          const tr = document.createElement('tr');
          const tdDesc = document.createElement('td');
          tdDesc.textContent = row.description;

          const tdKey = document.createElement('td');
          tdKey.className = 'shortcut-key-cell';
          if (row.assigned) {
            const kbd = document.createElement('kbd');
            kbd.className = 'chip chip-mono';
            kbd.textContent = row.shortcut;
            tdKey.append(kbd);
          } else {
            const none = document.createElement('span');
            none.className = 'muted';
            none.textContent = 'Atanmamış';
            tdKey.append(none);
          }
          if (row.duplicate) {
            const dup = document.createElement('span');
            dup.className = 'chip chip-danger';
            dup.textContent = '⚠ Çakışıyor';
            tdKey.append(' ', dup);
          }

          tr.append(tdDesc, tdKey);
          return tr;
        }

        const li = document.createElement('li');
        li.className = 'list-row';
        const title = document.createElement('strong');
        title.textContent = row.description;
        const keys = document.createElement('span');
        keys.className = row.assigned ? 'chip chip-mono' : 'muted';
        keys.textContent = row.assigned ? row.shortcut : 'Atanmamış';
        if (row.duplicate) keys.textContent += ' · ⚠ Çakışıyor';
        li.append(title, keys);
        return li;
      })
    );

    const duplicates = rows.filter(r => r.duplicate);
    warning.textContent = duplicates.length
      ? `Uyarı: ${duplicates.map(r => r.description).join(', ')} aynı kısayolu paylaşıyor.`
      : '';
    warning.hidden = !duplicates.length;
  }

  return { render };
}
