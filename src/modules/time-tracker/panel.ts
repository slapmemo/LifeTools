import { popupDb } from '../../db/client';
import type { Executor } from '../../db/migrations';
import { EXCLUDED_KEY } from './background';
import { createTimeTrackerRepo } from './repo';
import { localDay, siteKey } from './tracker';
export function formatDuration(seconds: number): string { const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60); return h ? `${h} sa ${m} dk` : m ? `${m} dk` : `${seconds} sn`; }
function $<T extends HTMLElement>(s: string): T { return document.querySelector(s) as T; }
export function initTimeTrackerPanel(db: Executor = popupDb): { render(): Promise<void> } {
 const repo = createTimeTrackerRepo(db), list = $<HTMLElement>('#time-list'), exclusions = $<HTMLElement>('#time-exclusions'), input = $<HTMLInputElement>('#time-domain'), feedback = $<HTMLElement>('#time-feedback'), del = $<HTMLButtonElement>('#time-delete');
 let week = false, confirmDelete = false;
 async function render(): Promise<void> { try {
   const now = Date.now(), d = new Date(now); d.setDate(d.getDate()-6);
   const rows = week ? await repo.getRange(localDay(d.getTime()), localDay(now)) : await repo.getDay(localDay(now)); const total = rows.reduce((sum, r) => sum+r.seconds, 0);
   $('#time-total').textContent = `Toplam: ${formatDuration(total)}`; list.replaceChildren();
   for (const row of rows) { const li = document.createElement('li'), text = document.createElement('div'), bar = document.createElement('div'), fill = document.createElement('div'); text.textContent = `${row.domain} ? ${formatDuration(row.seconds)}`; bar.className = 'time-bar'; fill.style.width = `${total ? 100*row.seconds/total : 0}%`; bar.append(fill); li.append(text,bar); list.append(li); }
   const values = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[]; exclusions.replaceChildren();
   for (const domain of values) { const li = document.createElement('li'), button = document.createElement('button'); li.append(document.createTextNode(domain+' ')); button.type='button'; button.textContent='Kald?r'; button.addEventListener('click', () => { void chrome.storage.local.set({ [EXCLUDED_KEY]: values.filter(v => v !== domain) }).then(render); }); li.append(button); exclusions.append(li); }
 } catch (e) { feedback.textContent = e instanceof Error ? e.message : 'İşlem başarısız.'; } }
 $('#time-toggle').addEventListener('click', () => { week = !week; $('#time-toggle').textContent = week ? 'Bug?n' : 'Son 7 g?n'; $('#time-heading').textContent = week ? 'Son 7 g?n' : 'Bug?n'; void render(); });
 $('#time-form').addEventListener('submit', e => { e.preventDefault(); void (async () => { const domain = siteKey(input.value.includes('://') ? input.value : 'https://'+input.value); if (!domain) { feedback.textContent='Ge?erli bir site gir.'; return; } const values = (await chrome.storage.local.get({ [EXCLUDED_KEY]: [] }))[EXCLUDED_KEY] as string[]; await chrome.storage.local.set({ [EXCLUDED_KEY]: [...new Set([...values,domain])] }); input.value=''; feedback.textContent=''; await render(); })(); });
 del.addEventListener('click', () => { if (!confirmDelete) { confirmDelete=true; del.textContent='Silmek i?in tekrar t?kla'; return; } void (async () => { await repo.deleteAll(); confirmDelete=false; del.textContent='T?m verileri sil'; await render(); })(); });
 return { render };
}
