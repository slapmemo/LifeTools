import { icon } from '../../../design/icons';
import { groupModulesByCategory } from '../../core/ui-visibility';
import { MODULE_FLAGS_KEY, resolveEnabled, setModuleEnabled } from '../../core/module-state';
import { modules } from '../../modules';
import { showToast } from '../ui';

/** Modül aç/kapa listesini hazırlar; render fonksiyonunu döndürür. */
export function initModulesToggle(refresh: () => Promise<void>): (rawFlags?: unknown) => Promise<void> {
  const modulesList = document.querySelector('#modules-list') as HTMLElement;

  return async function renderModules(rawFlags?: unknown): Promise<void> {
    const flags =
      rawFlags !== undefined
        ? rawFlags
        : (await chrome.storage.local.get({ [MODULE_FLAGS_KEY]: {} }))[MODULE_FLAGS_KEY];
    modulesList.replaceChildren();

    const grouped = groupModulesByCategory(modules);
    for (const cat of grouped) {
      const block = document.createElement('div');
      block.className = 'module-category-block';

      const h4 = document.createElement('h4');
      h4.className = 'module-category-heading';
      h4.append(icon(cat.icon, 15), cat.label);

      const ul = document.createElement('ul');
      ul.className = 'module-category-list';

      for (const module of cat.modules) {
        const enabled = resolveEnabled(flags, module.id);

        const item = document.createElement('li');
        item.className = 'module-item';

        const text = document.createElement('div');
        text.className = 'module-text';
        const name = document.createElement('strong');
        name.textContent = module.name;
        const desc = document.createElement('p');
        desc.className = 'clamp-1';
        desc.textContent = module.description;
        text.append(name, desc);

        const label = document.createElement('label');
        label.className = 'switch';
        label.setAttribute('aria-label', `${module.name} aç veya kapat`);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = enabled;
        input.addEventListener('change', () => {
          void setModuleEnabled(module.id, input.checked).then(() => {
            showToast(`${module.name} ${input.checked ? 'açıldı' : 'kapatıldı'}.`, 'info');
            return refresh();
          });
        });
        const track = document.createElement('span');
        track.className = 'switch-track';
        label.append(input, track);

        item.append(text, label);
        ul.append(item);
      }

      block.append(h4, ul);
      modulesList.append(block);
    }
  };
}
