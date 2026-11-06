import { requestAllActions } from '../../core/actions';
import { originFromInput } from '../../core/site-scripts';
import { normalizeToolbarSettings, TOOLBAR_SITES_KEY, type ToolbarSite } from './settings';

const DEFAULT_ACTIONS = ['link.copyPage', 'task.addPage'];
function $<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }

export function initSiteToolbarPanel(): { render(): Promise<void> } {
  const form = $<HTMLFormElement>('toolbar-site-form'), input = $<HTMLInputElement>('toolbar-site'), list = $<HTMLElement>('toolbar-sites'), feedback = $<HTMLElement>('toolbar-feedback');
  const say = (text: string): void => { feedback.textContent = text; };
  let allowed: { id: string; title: string }[] = [];

  async function load(): Promise<ToolbarSite[]> {
    const data = await chrome.storage.local.get({ [TOOLBAR_SITES_KEY]: [] });
    return normalizeToolbarSettings(data[TOOLBAR_SITES_KEY], allowed.map(a => a.id));
  }
  async function save(sites: ToolbarSite[]): Promise<void> { await chrome.storage.local.set({ [TOOLBAR_SITES_KEY]: sites }); }

  async function render(): Promise<void> {
    allowed = (await requestAllActions()).filter(a => a.toolbar).map(a => ({ id: a.id, title: a.title }));
    const sites = await load();
    list.replaceChildren();
    for (const site of sites) {
      const li = document.createElement('li');
      const name = document.createElement('strong'); name.textContent = site.origin.replace(/\/\*$/, '');
      li.append(name);
      for (const action of allowed) {
        const label = document.createElement('label'); label.style.display = 'block';
        const box = document.createElement('input'); box.type = 'checkbox'; box.checked = site.actions.includes(action.id);
        box.addEventListener('change', () => { void (async () => {
          const current = await load();
          const entry = current.find(s => s.origin === site.origin);
          if (!entry) return;
          entry.actions = box.checked ? [...new Set([...entry.actions, action.id])] : entry.actions.filter(id => id !== action.id);
          await save(current); say('Kaydedildi. Değişiklik yeni açılan ve yenilenen sayfalarda görünür.');
        })().catch(() => say('Kaydedilemedi.')); });
        label.append(box, ' ', action.title); li.append(label);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Kaldır';
      remove.addEventListener('click', () => { void (async () => {
        await save((await load()).filter(s => s.origin !== site.origin));
        await chrome.permissions.remove({ origins: [site.origin] });
        await render();
      })().catch(() => say('Site kaldırılamadı.')); });
      li.append(remove); list.append(li);
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const origin = originFromInput(input.value);
    if (!origin) { say('Geçerli bir site adresi gir.'); return; }
    void chrome.permissions.request({ origins: [origin] }).then(async granted => {
      if (!granted) { say('Site izni verilmedi.'); return; }
      const sites = await load();
      if (!sites.some(s => s.origin === origin)) {
        const defaults = DEFAULT_ACTIONS.filter(id => allowed.some(a => a.id === id));
        await save([...sites, { origin, actions: defaults }]);
      }
      input.value = ''; await render(); say('Site eklendi. Araç çubuğu yeni açılan sayfalarda görünür.');
    }).catch(() => say('Site eklenemedi.'));
  });
  return { render };
}
