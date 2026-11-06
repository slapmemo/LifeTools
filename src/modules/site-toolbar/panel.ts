import { requestActions, requestAllActions } from '../../core/actions';
import { originFromInput } from '../../core/site-scripts';
import {
  createEmptyState,
  createKebabMenu,
  createListRow,
  showToast
} from '../../panel/ui';
import { normalizeToolbarSettings, TOOLBAR_SITES_KEY, type ToolbarSite } from './settings';

const DEFAULT_ACTIONS = ['link.copyPage', 'task.addPage'];
function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export function initSiteToolbarPanel(): { render(): Promise<void> } {
  const form = $<HTMLFormElement>('toolbar-site-form');
  const input = $<HTMLInputElement>('toolbar-site');
  const list = $<HTMLElement>('toolbar-sites');
  const empty = document.getElementById('toolbar-empty');
  const feedback = $<HTMLElement>('toolbar-feedback');

  let visibleActions: { id: string; title: string }[] = [];
  let allActionIds: string[] = [];

  function say(text: string, isError = false): void {
    feedback.textContent = text;
    feedback.className = isError ? 'feedback error' : 'feedback';
    showToast(text, isError ? 'error' : 'info');
  }

  async function load(): Promise<ToolbarSite[]> {
    const data = await chrome.storage.local.get({ [TOOLBAR_SITES_KEY]: [] });
    return normalizeToolbarSettings(data[TOOLBAR_SITES_KEY], allActionIds);
  }

  async function save(sites: ToolbarSite[]): Promise<void> {
    await chrome.storage.local.set({ [TOOLBAR_SITES_KEY]: sites });
  }

  function formatOrigin(origin: string): string {
    return origin.replace(/^https?:\/\//, '').replace(/\/\*$/, '');
  }

  async function render(): Promise<void> {
    const [enabledInfos, allInfos] = await Promise.all([requestActions(), requestAllActions()]);
    visibleActions = enabledInfos.filter(a => a.toolbar).map(a => ({ id: a.id, title: a.title }));
    allActionIds = allInfos.filter(a => a.toolbar).map(a => a.id);

    const sites = await load();
    list.replaceChildren();

    for (const site of sites) {
      const content = document.createElement('div');
      content.className = 'toolbar-site-main';

      const name = document.createElement('strong');
      name.className = 'toolbar-site-name';
      name.textContent = formatOrigin(site.origin);
      content.append(name);

      const chipWrap = document.createElement('div');
      chipWrap.className = 'chip-list';

      for (const action of visibleActions) {
        const active = site.actions.includes(action.id);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `chip chip-toggle${active ? ' active' : ''}`;
        chip.setAttribute('aria-pressed', String(active));
        chip.textContent = action.title;
        chip.addEventListener('click', () => {
          void (async () => {
            const current = await load();
            const entry = current.find(s => s.origin === site.origin);
            if (!entry) return;
            const isSelected = entry.actions.includes(action.id);
            entry.actions = isSelected
              ? entry.actions.filter(id => id !== action.id)
              : [...new Set([...entry.actions, action.id])];
            await save(current);
            await render();
            say('Araç çubuğu eylemleri güncellendi.');
          })().catch(() => say('Kaydedilemedi.', true));
        });
        chipWrap.append(chip);
      }

      content.append(chipWrap);

      const menu = createKebabMenu(
        [
          {
            label: 'Siteyi kaldır',
            icon: 'trash-2',
            danger: true,
            confirm: true,
            onSelect: () => {
              void (async () => {
                await save((await load()).filter(s => s.origin !== site.origin));
                await chrome.permissions.remove({ origins: [site.origin] });
                await render();
                say('Site kaldırıldı.');
              })().catch(() => say('Site kaldırılamadı.', true));
            }
          }
        ],
        'Site işlemleri'
      );

      list.append(
        createListRow({
          content,
          actions: menu,
          className: 'toolbar-site-item'
        })
      );
    }

    list.hidden = sites.length === 0;
    if (empty) {
      empty.hidden = sites.length > 0;
      if (sites.length === 0) {
        empty.replaceChildren(
          createEmptyState({
            icon: 'layout-grid',
            title: 'Henüz site eklenmedi.',
            hint: 'Site izninden sonra o sitede küçük, sürüklenebilir bir LT düğmesi görünür.'
          })
        );
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const origin = originFromInput(input.value);
    if (!origin) {
      say('Geçerli bir site adresi gir.', true);
      return;
    }
    void chrome.permissions
      .request({ origins: [origin] })
      .then(async granted => {
        if (!granted) {
          say('Site izni verilmedi.', true);
          return;
        }
        const sites = await load();
        if (!sites.some(s => s.origin === origin)) {
          const defaults = DEFAULT_ACTIONS.filter(id => allActionIds.includes(id));
          await save([...sites, { origin, actions: defaults }]);
        }
        input.value = '';
        await render();
        say('Site eklendi. Araç çubuğu yeni açılan sayfalarda görünür.');
      })
      .catch(() => say('Site eklenemedi.', true));
  });

  return { render };
}
