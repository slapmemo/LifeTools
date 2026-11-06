import { registerAction } from './actions';
import { backgroundDb, copyOffscreen } from '../db/host';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { createNotesRepo } from '../modules/slapmemo/repo';
import { QUICK_TASKS_ID } from '../modules/quick-tasks/background';
import { createTasksRepo } from '../modules/quick-tasks/repo';
import { LINK_CLEANER_ID } from '../modules/link-cleaner/background';
import { cleanUrl } from '../modules/link-cleaner/clean';
import { SITE_BLOCKER_ID } from '../modules/site-blocker/background';
import { LIFE_BROWSER_ID } from '../modules/life-browser/background';
import { createSessionsRepo } from '../modules/life-browser/repo';
import { describeTabs, groupWindowBySite } from '../modules/life-browser/browser';
import { ZOMBIE_TABS_ID } from '../modules/zombie-tabs/background';
import { TAB_SWITCHER_ID } from '../modules/tab-switcher/background';
import { TIME_TRACKER_ID } from '../modules/time-tracker/background';

const notes = createNotesRepo(backgroundDb);
const tasks = createTasksRepo(backgroundDb);
const sessions = createSessionsRepo(backgroundDb);

/** Popup'ı sekme olarak açar ve ilgili bölüme kaydırır (popup.ts hash'i okur). */
async function openPopupSection(hash: string): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html#${hash}`) });
}

function needTab(tab: chrome.tabs.Tab | undefined): chrome.tabs.Tab & { id: number } {
  if (!tab || tab.id === undefined) throw new Error('Etkin sekme bulunamadı.');
  return tab as chrome.tabs.Tab & { id: number };
}

registerAction({
  id: 'note.add', title: 'Not ekle: <metin>', keywords: ['not', 'slapmemo', 'hızlı not'], moduleId: SLAPMEMO_ID, takesArg: true, argPrefix: 'not ',
  async run({ arg, tab }) {
    const { duplicate } = await notes.addNote({ category: 'note', text: (arg ?? '').slice(0, 5000), url: tab?.url ?? null, pageTitle: tab?.title ?? null });
    return duplicate ? 'Not zaten kayıtlı.' : 'Not kaydedildi.';
  }
});

registerAction({
  id: 'note.saveSelection', title: 'Seçimi kaydet', keywords: ['seçim', 'slapmemo', 'not', 'kaydet'], moduleId: SLAPMEMO_ID, toolbar: true,
  async run({ tab }) {
    const active = needTab(tab);
    const results = await chrome.scripting.executeScript({ target: { tabId: active.id }, func: () => String(window.getSelection() ?? '') });
    const text = typeof results[0]?.result === 'string' ? (results[0].result as string).trim().slice(0, 5000) : '';
    if (!text) throw new Error('Seçili metin yok.');
    const { duplicate } = await notes.addNote({ category: 'note', text, url: active.url ?? null, pageTitle: active.title ?? null });
    return duplicate ? 'Not zaten kayıtlı.' : 'Seçim kaydedildi.';
  }
});

registerAction({
  id: 'task.add', title: 'Görev ekle: <metin>', keywords: ['görev', 'gorev', 'yapılacak', 'todo'], moduleId: QUICK_TASKS_ID, takesArg: true, argPrefix: 'görev ',
  async run({ arg }) { await tasks.add({ title: (arg ?? '').slice(0, 300) }); return 'Görev eklendi.'; }
});

registerAction({
  id: 'task.addPage', title: 'Görev ekle (bu sayfa)', keywords: ['görev', 'sayfa', 'sonra bak'], moduleId: QUICK_TASKS_ID, toolbar: true,
  async run({ tab }) {
    const active = needTab(tab);
    const url = active.url ?? null;
    await tasks.add({ title: (active.title || url || 'Sayfa').slice(0, 300), url });
    return 'Görev eklendi.';
  }
});

registerAction({
  id: 'link.copyPage', title: 'Sayfanın temiz linkini kopyala', keywords: ['link', 'temiz', 'kopyala', 'url'], moduleId: LINK_CLEANER_ID, toolbar: true,
  async run({ tab }) {
    const result = cleanUrl(needTab(tab).url ?? '');
    if (!result) throw new Error('Bu sayfanın linki temizlenemedi.');
    if (!(await copyOffscreen(result.url))) throw new Error('Panoya kopyalanamadı.');
    return 'Temiz link kopyalandı.';
  }
});

registerAction({
  id: 'blocker.toggle', title: 'Engelleyiciyi aç/kapat', keywords: ['engelleyici', 'site', 'koruma', 'x'], moduleId: SITE_BLOCKER_ID, toolbar: true,
  async run() {
    const data = await chrome.storage.local.get({ enabled: true });
    const next = data.enabled === false;
    await chrome.storage.local.set({ enabled: next });
    return next ? 'Engelleyici açıldı.' : 'Engelleyici kapatıldı.';
  }
});

registerAction({
  id: 'session.save', title: 'Oturumu kaydet', keywords: ['oturum', 'lifebrowser', 'sekmeleri kaydet'], moduleId: LIFE_BROWSER_ID, toolbar: true,
  async run({ tab }) {
    const active = needTab(tab);
    const tabs = await chrome.tabs.query({ windowId: active.windowId });
    const name = `Oturum ${new Date().toLocaleString('tr-TR')}`;
    await sessions.save(name, await describeTabs(tabs));
    return `${tabs.length} sekme kaydedildi.`;
  }
});

registerAction({
  id: 'group.bySite', title: 'Siteye göre grupla', keywords: ['grupla', 'sekme grubu', 'lifebrowser'], moduleId: LIFE_BROWSER_ID, toolbar: true,
  async run({ tab }) {
    const created = await groupWindowBySite(needTab(tab).windowId);
    return created ? `${created} grup oluşturuldu.` : 'Gruplanacak (en az 2 sekmeli) site yok.';
  }
});

registerAction({
  id: 'zombie.show', title: 'Zombi sekmeleri göster', keywords: ['zombi', 'eski sekmeler', 'temizle'], moduleId: ZOMBIE_TABS_ID,
  async run() { await openPopupSection('zombie-tabs-panel'); }
});

registerAction({
  id: 'switcher.open', title: 'Sekme değiştiriciyi aç', keywords: ['sekme', 'değiştirici', 'geçiş'], moduleId: TAB_SWITCHER_ID,
  async run() { await chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html') }); }
});

registerAction({
  id: 'time.today', title: 'Bugünkü süreleri göster', keywords: ['süre', 'zaman', 'takip', 'bugün'], moduleId: TIME_TRACKER_ID,
  async run() { await openPopupSection('time-tracker-panel'); }
});

registerAction({
  id: 'backup.download', title: 'Yedeği indir', keywords: ['yedek', 'indir', 'dışa aktar'], moduleId: 'core',
  async run() { await openPopupSection('backup-download'); }
});
