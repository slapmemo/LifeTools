import { popupDb } from '../../db/client';
import { isModuleEnabled } from '../../core/module-state';
import { createTabLabelsRepo } from '../tab-labels/repo';
import { TAB_LABELS_ID } from '../tab-labels/background';
import { createTabNotesRepo } from './repo';
import { TAB_NOTES_ID, TRANSFER_KEY } from './background';
import { TITLE_CLEANER_ID } from '../title-cleaner';
import { TITLE_RULES_KEY, type TitleRules } from '../title-cleaner/cleaner';
import { TAB_SWITCHER_ID } from '../tab-switcher/background';
const get = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
export function initTabToolsPanel(): { render(): Promise<void> } {
 const label = get<HTMLInputElement>('tab-label'), note = get<HTMLTextAreaElement>('tab-note'), transfer = get<HTMLInputElement>('tab-note-transfer'), rules = get<HTMLTextAreaElement>('title-rule'), feedback = get<HTMLElement>('tab-tools-feedback');
 let url = '', host = '';
 const labels = createTabLabelsRepo(popupDb), notes = createTabNotesRepo(popupDb);
 function action(fn: () => Promise<void>): void { void fn().catch(err => { feedback.textContent = err instanceof Error ? err.message : 'İşlem başarısız.'; }); }
 async function render(): Promise<void> { const [tab] = await chrome.tabs.query({active:true,currentWindow:true}); url = tab?.url || ''; try { host = new URL(url).hostname.toLowerCase().replace(/^www\./,''); } catch { host = ''; }
  const [le, ne, ce, se, data] = await Promise.all([isModuleEnabled(TAB_LABELS_ID),isModuleEnabled(TAB_NOTES_ID),isModuleEnabled(TITLE_CLEANER_ID),isModuleEnabled(TAB_SWITCHER_ID),chrome.storage.local.get({[TRANSFER_KEY]:false,[TITLE_RULES_KEY]:{}})]);
  get<HTMLElement>('tab-tools').hidden = !(le || ne || ce || se); get<HTMLElement>('tab-labels-controls').hidden = !le; get<HTMLElement>('tab-notes-controls').hidden = !ne; get<HTMLElement>('title-cleaner-controls').hidden = !ce; get<HTMLElement>('open-switcher').hidden = !se;
  label.value = url ? (await labels.get(url))?.label || '' : ''; note.value = url ? (await notes.get(url))?.note || '' : ''; transfer.checked = Boolean(data[TRANSFER_KEY]); rules.value = ((data[TITLE_RULES_KEY] as TitleRules)[host] || []).join('\n');
 }
 get('tab-label-save').addEventListener('click', () => action(async () => { if (!url) throw new Error('Sekme adresi bulunamadı.'); await labels.set(url,label.value); feedback.textContent = 'Etiket kaydedildi.'; }));
 get('tab-note-save').addEventListener('click', () => action(async () => { if (!url) throw new Error('Sekme adresi bulunamadı.'); await notes.set(url,note.value); feedback.textContent = 'Not kaydedildi.'; }));
 transfer.addEventListener('change', () => action(async () => { await chrome.storage.local.set({[TRANSFER_KEY]:transfer.checked}); }));
 get('title-rule-save').addEventListener('click', () => action(async () => { if (!host) throw new Error('Site bulunamadı.'); const data = await chrome.storage.local.get({[TITLE_RULES_KEY]:{}}); const all = { ...data[TITLE_RULES_KEY] } as TitleRules; all[host] = rules.value.split('\n').map(x => x.trim()).filter(Boolean); if (!all[host].length) delete all[host]; await chrome.storage.local.set({[TITLE_RULES_KEY]:all}); feedback.textContent = 'Kurallar kaydedildi.'; }));
 get('open-switcher').addEventListener('click', () => { void chrome.tabs.create({url:chrome.runtime.getURL('switcher.html')}); });
 return { render };
}
