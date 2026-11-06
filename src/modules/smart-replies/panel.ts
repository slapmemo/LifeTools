import { popupDb } from '../../db/client';
import { originFromInput } from '../../core/site-scripts';
import { createSnippetsRepo, type Snippet } from './repo';
import { CHANGE_KEY, SITES_KEY } from './background';
function $<T extends HTMLElement>(id: string): T { return document.getElementById(id) as T; }
export function initSmartRepliesPanel() {
  const repo = createSnippetsRepo(popupDb);
  const form = $<HTMLFormElement>('snippet-form'), trigger = $<HTMLInputElement>('snippet-trigger'), title = $<HTMLInputElement>('snippet-title'), body = $<HTMLTextAreaElement>('snippet-body'), search = $<HTMLInputElement>('snippet-search'), list = $<HTMLElement>('snippet-list'), feedback = $<HTMLElement>('snippet-feedback'), site = $<HTMLInputElement>('snippet-site'), sites = $<HTMLElement>('snippet-sites');
  let editing: number | null = null, seq = 0;
  function message(text: string) { feedback.textContent = text; }
  async function changed() { await chrome.storage.local.set({ [CHANGE_KEY]: Date.now() + Math.random() }); }
  async function render() {
    const current = ++seq;
    try {
      const [rows, data] = await Promise.all([repo.list(search.value.trim()), chrome.storage.local.get({ [SITES_KEY]: [] })]);
      if (current !== seq) return;
      list.replaceChildren();
      for (const row of rows) {
        const li = document.createElement('li'); li.className = 'memo-item';
        const label = document.createElement('strong'); label.textContent = `${row.trigger} — ${row.title}`;
        const text = document.createElement('p'); text.className = 'memo-text'; text.textContent = row.body;
        const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Düzenle'; edit.onclick = () => { editing = row.id; trigger.value = row.trigger; title.value = row.title; body.value = row.body; trigger.focus(); };
        const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Kopyala'; copy.onclick = () => { void navigator.clipboard.writeText(row.body).then(() => message('Metin kopyalandı.')).catch(() => message('Metin kopyalanamadı.')); };
        const del = document.createElement('button'); del.type = 'button'; del.textContent = 'Sil'; del.onclick = () => { void repo.delete(row.id).then(changed).then(render).catch(() => message('Şablon silinemedi.')); };
        li.append(label,text,edit,copy,del); list.append(li);
      }
      sites.replaceChildren();
      for (const origin of data[SITES_KEY] as string[]) {
        const li = document.createElement('li'); li.textContent = origin;
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Kaldır'; remove.onclick = () => { void (async () => {
          const data = await chrome.storage.local.get({ [SITES_KEY]: [] });
          await chrome.storage.local.set({ [SITES_KEY]: (data[SITES_KEY] as string[]).filter(x => x !== origin) });
          await chrome.permissions.remove({ origins: [origin] }); await render();
        })().catch(() => message('Site kaldırılamadı.')); }; li.append(' ',remove); sites.append(li);
      }
    } catch { message('Şablonlar yüklenemedi.'); }
  }
  form.onsubmit = event => { event.preventDefault(); void (async () => { try {
    const input = { trigger: trigger.value, title: title.value, body: body.value };
    if (editing === null) await repo.add(input); else await repo.update(editing,input);
    editing = null; form.reset(); await changed(); await render(); message('Şablon kaydedildi.');
  } catch (err) { message(err instanceof Error ? err.message : 'Şablon kaydedilemedi.'); } })(); };
  $<HTMLButtonElement>('snippet-cancel').onclick = () => { editing = null; form.reset(); };
  search.oninput = () => { void render(); };
  $<HTMLFormElement>('snippet-site-form').onsubmit = event => {
    event.preventDefault();
    const origin = originFromInput(site.value);
    if (!origin) { message('Geçerli bir site adresi gir.'); return; }
    void chrome.permissions.request({ origins: [origin] }).then(async granted => {
      if (!granted) { message('Site izni verilmedi.'); return; }
      const data = await chrome.storage.local.get({ [SITES_KEY]: [] }); await chrome.storage.local.set({ [SITES_KEY]: [...new Set([...(data[SITES_KEY] as string[]), origin])] }); site.value = ''; await render(); message('Site eklendi.');
    }).catch(() => message('Site eklenemedi.'));
  };
  return { render };
}
