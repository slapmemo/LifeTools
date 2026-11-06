import { test, expect } from 'vitest';
import { createMemoryExecutor } from './sqlite-memory';
import { runMigrations } from '../src/db/migrations';
import { createTabLabelsRepo } from '../src/modules/tab-labels/repo';
import { createTabNotesRepo } from '../src/modules/tab-notes/repo';
import { createNotesRepo } from '../src/modules/slapmemo/repo';
import { transferTabNote } from '../src/modules/tab-notes/transfer';
import { cleanTitle } from '../src/modules/title-cleaner/cleaner';
import { filterTabs } from '../src/modules/tab-switcher/filter';
import { exportData, restoreData, validateBackup } from '../src/core/backup';
import { backupSettingKeys } from '../src/core/backup-settings';

test('başlık sayacı, site son eki, kurallar ve uzunluk temizlenir', () => {
 expect(cleanTitle('(3)  Video  - YouTube', 'https://youtube.com/watch', {})).toBe('Video');
 expect(cleanTitle('Başlık | X', 'https://x.com/a', {})).toBe('Başlık');
 expect(cleanTitle('arama – Google Search', 'https://google.com', {})).toBe('arama');
 expect(cleanTitle('Başlık reklam', 'https://example.com', {'example.com':['reklam']})).toBe('Başlık');
 expect(cleanTitle('x'.repeat(90), 'https://example.com', {})).toBe('x'.repeat(79)+'…');
});
test('etiket ve notlar hash yok sayılarak güncellenir ve aktarılır', async () => {
 const ex = await createMemoryExecutor(); await runMigrations(ex); let time = 1;
 const labels = createTabLabelsRepo(ex, () => time++), notes = createTabNotesRepo(ex, () => time++), memo = createNotesRepo(ex);
 await labels.set('https://example.com/a#bir','Önemli'); await labels.set('https://example.com/a#iki','Araştırma');
 expect((await labels.list())).toHaveLength(1); expect((await labels.get('https://example.com/a'))?.label).toBe('Araştırma');
 await notes.set('https://example.com/a#bir','ilk'); const created = (await notes.get('https://example.com/a'))!.created_at;
 await notes.set('https://example.com/a#iki','son'); expect((await notes.get('https://example.com/a'))?.created_at).toBe(created);
 await expect(transferTabNote('https://example.com/a#üç','Başlık',notes,{addNote: async () => { throw new Error('hata'); }})).rejects.toThrow();
 expect(await notes.get('https://example.com/a')).not.toBeNull();
 expect(await transferTabNote('https://example.com/a#üç','Başlık',notes,memo)).toBe(true);
 expect(await notes.get('https://example.com/a')).toBeNull(); expect((await memo.listNotes())[0]).toMatchObject({category:'note', text:'son',url:'https://example.com/a',page_title:'Başlık'});
});
test('arama Türkçe, etiket ve not eşleşmelerini bulur', () => {
 const tabs = [{ title:'Çalışma',url:'https://a',label:'Önemli',note:'İş planı' }, {title:'Diğer',url:'https://b',label:'',note:''}];
 for (const q of ['calisma','onemli','is plani']) expect(filterTabs(tabs,q)).toEqual([tabs[0]]);
});
test('yedeğe sekme tabloları ve ayarlar eklenir', async () => {
 const ex = await createMemoryExecutor(); await runMigrations(ex);
 await createTabLabelsRepo(ex).set('https://example.com/#a','Önemli'); await createTabNotesRepo(ex).set('https://example.com/#b','not');
 const settings = { titleCleanerRules: {'example.com':['reklam']}, tabNotesTransferOnClose: true }; expect(backupSettingKeys()).toEqual(expect.arrayContaining(Object.keys(settings)));
 const backup = await exportData(ex,settings); await ex.exec('DELETE FROM tab_labels'); await ex.exec('DELETE FROM tab_notes');
 await restoreData(ex,validateBackup(JSON.parse(JSON.stringify(backup)))); expect(await exportData(ex,settings)).toMatchObject({tables:backup.tables,settings});
});
