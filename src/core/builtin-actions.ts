import { WATCHLIST_ID } from '../modules/watchlist/background';
import { createWatchRepo, guessKind } from '../modules/watchlist/repo';
import { PIP_ID, togglePip } from '../modules/pip/background';
import { CLIP_SLOTS_ID } from '../modules/clip-slots/background';
import { getSlots, SLOT_IDS } from '../modules/clip-slots/slots';
import { registerAction } from './actions';
import { backgroundDb, copyOffscreen } from '../db/host';
import { SLAPMEMO_ID } from '../modules/slapmemo/background';
import { createNotesRepo } from '../modules/slapmemo/repo';
import { QUICK_TASKS_ID, rescheduleTaskReminders } from '../modules/quick-tasks/background';
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
import { parseTurkishDue } from '../modules/command-center/search';
import { openTabManager } from '../modules/tab-manager/open';
import { downloadBackup } from './auto-backup-background';

const notes = createNotesRepo(backgroundDb);
const tasks = createTasksRepo(backgroundDb, Date.now, rescheduleTaskReminders);
const sessions = createSessionsRepo(backgroundDb);

/** Popup'ı sekme olarak açar ve ilgili bölüme kaydırır (popup.ts hash'i okur). */
async function openPopupSection(hash: string): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`panel.html#${hash === 'zombie-tabs-panel' ? 'sekmeler' : hash === 'time-tracker-panel' ? 'odak' : 'backup-download'}`) });
}

function needTab(tab: chrome.tabs.Tab | undefined): chrome.tabs.Tab & { id: number } {
  if (!tab || tab.id === undefined) throw new Error('Etkin sekme bulunamadı.');
  return tab as chrome.tabs.Tab & { id: number };
}

registerAction({
  id: 'note.add', title: 'Not ekle: <metin>', keywords: ['not', 'slapmemo', 'hızlı not'], moduleId: SLAPMEMO_ID, takesArg: true, argPrefix: 'not ',
  async run({ arg, tab }) {
    const { duplicate } = await notes.addNote({ category: 'note', text: (arg ?? '').slice(0, 5000), url: tab?.url ?? null, pageTitle: tab?.title ?? null });
    return duplicate ? 'Not zaten kayıtlı.' : `Not kaydedildi: ${(arg ?? '').slice(0, 120)}`;
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
  async run({ arg }) { const parsed = parseTurkishDue(arg ?? '', new Date()); await tasks.add({ title: parsed.title.slice(0, 300), due_date: parsed.due?.slice(0, 10), note: parsed.due?.slice(11) ? `Saat: ${parsed.due.slice(11)}` : null }); return `Görev eklendi: ${parsed.title}${parsed.due ? ` — ${parsed.due}` : ''}`; }
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
  async run({ tab, arg }) {
    const active = needTab(tab);
    const tabs = await chrome.tabs.query({ windowId: active.windowId });
    const name = arg?.slice(0, 200) || `Oturum ${new Date().toLocaleString('tr-TR')}`;
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
  async run() { await chrome.tabs.create({ url: chrome.runtime.getURL('switcher.html?zombies=1') }); }
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
  async run() { await downloadBackup(); return 'Yedek indirme işlemi başlatıldı.'; }
});

registerAction({ id:'watch.addPage', title:'İzleme listesine ekle (sayfa)', keywords:['izleme','video','sayfa'], moduleId:WATCHLIST_ID, toolbar:true, async run({tab}) { const t=needTab(tab); const url=t.url ?? ''; await createWatchRepo(backgroundDb).add({title:(t.title || url || 'Sayfa').slice(0,300),kind:guessKind(url),url}); return 'İzleme listesine eklendi.'; } });
registerAction({ id:'watch.add', title:'İzleme listesine ekle: <başlık>', keywords:['izle','izleme'], moduleId:WATCHLIST_ID, takesArg:true, argPrefix:'izle ', async run({arg}) { const title=(arg ?? '').slice(0,300); await createWatchRepo(backgroundDb).add({title,kind:'diger'}); return `İzleme listesine eklendi: ${title}`; } });
registerAction({ id:'duplicates.show', title:'Kopya sekmeleri göster', keywords:['kopyalar','sekme'], moduleId:LIFE_BROWSER_ID, toolbar:true, async run() { await chrome.tabs.create({url:chrome.runtime.getURL('switcher.html?duplicates=1')}); } });
registerAction({ id:'tabmanager.open', title:'Sekme yöneticisi', keywords:['sekmeler','onetab','yönetici'], moduleId:'tab-manager', toolbar:true, async run({tab}) { await openTabManager(tab?.windowId); } });
registerAction({ id:'pip.toggle', title:'Resim içinde resim', keywords:['video','pip'], moduleId:PIP_ID, toolbar:true, async run({tab}) { return togglePip(needTab(tab).id); } });
SLOT_IDS.forEach((slot,i)=>registerAction({id:'clip.copy'+slot,title:`Yuva ${slot}'yı kopyala`,keywords:['pano','yuva','kopyala',slot],moduleId:CLIP_SLOTS_ID,toolbar:true,async run(){const text=(await getSlots())[i].text; if(!text) throw new Error('Yuva boş.'); if(!await copyOffscreen(text)) throw new Error('Panoya kopyalanamadı.'); return `Yuva ${slot} kopyalandı.`;}}));
