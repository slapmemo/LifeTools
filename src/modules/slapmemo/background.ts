import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { BUBBLE_ENABLED_KEY, BUBBLE_ORIGINS } from './bubble-logic';
import { pageToast } from '../../core/page-toast';
import { storedPageTheme } from '../../core/page-theme';
import { backgroundDb, withExclusiveDb } from '../../db/host';
import type { NoteCategory } from './categories';
import { createNotesRepo } from './repo';
import { createRecentStore } from './recent-notes';
import { normalizeNoteUrl } from './repo';
import { NOTE_HINT_ENABLED_KEY, hideNoteHint, noteCountText, showNoteHint } from './page-hint';
import { PAGE_COPY_KEY } from './settings';
import { translateText } from './translate';

export const SLAPMEMO_ID = 'slapmemo';
const repo = createNotesRepo(backgroundDb);
const recent = createRecentStore(typeof chrome !== 'undefined' ? chrome.storage?.session : undefined);
const MAX_TEXT = 50_000;
const TRANSLATE_MAX = 5000;
const TRASH_PURGE_ALARM = 'slapmemo-trash-purge';

export async function capturePage(id: number, tabId: number | undefined): Promise<void> {
  if (tabId === undefined || (await chrome.storage.local.get({ [PAGE_COPY_KEY]: true }))[PAGE_COPY_KEY] === false) return;
  try {
    const result = await chrome.scripting.executeScript({ target: { tabId }, func: () => ((document.querySelector('article, main') as HTMLElement | null) ?? document.body)?.innerText.replace(/\s+/g, ' ').trim().slice(0, 100000) ?? '' });
    if (result[0]?.result) await repo.savePage(id, result[0].result);
  } catch { /* Bazı sayfalara erişilemez. */ }
}

export async function saveScreenshot(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || !(await isModuleEnabled(SLAPMEMO_ID))) throw new Error('Sekme bulunamadı.');
  const active = await chrome.tabs.get(tab.id);
  if (!active.active) throw new Error('Etkin sekme bulunamadı.');
  const raw = await chrome.tabs.captureVisibleTab(active.windowId, { format: 'jpeg', quality: 70 });
  const bitmap = await createImageBitmap(await (await fetch(raw)).blob());
  try {
    let width = Math.min(bitmap.width, 1280), height = Math.max(1, Math.round(bitmap.height * width / bitmap.width));
    let blob: Blob;
    for (;;) {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Görüntü hazırlanamadı.');
      context.drawImage(bitmap, 0, 0, width, height);
      let quality = 0.7;
      blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      while (blob.size > 500000 && quality > 0.2) { quality -= 0.1; blob = await canvas.convertToBlob({ type: 'image/jpeg', quality }); }
      if (blob.size <= 500000) break;
      width = Math.max(1, Math.floor(width * 0.8)); height = Math.max(1, Math.floor(height * 0.8));
      if (width === 1 && height === 1) throw new Error('Görüntü küçültülemedi.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const result = await repo.addNote({ category: 'note', text: (active.title || active.url || 'Ekran görüntüsü').slice(0, MAX_TEXT), url: active.url, pageTitle: active.title, allowDuplicate: true });
    try { await repo.saveImage(result.note.id, `data:image/jpeg;base64,${btoa(binary)}`, width, height); }
    catch (err) { await repo.hardDeleteNote(result.note.id); throw err; }
    await recent.remember(result.note.id);
    try { await chrome.scripting.executeScript({ target: { tabId: active.id! }, func: pageToast, args: [{ ok: true, id: result.note.id, duplicate: false, category: 'note', categories: await repo.listCategories().then(rows => rows.map(({ id, label }) => ({ id, label }))).catch(() => undefined) }, await storedPageTheme()] }); }
    catch { flashBadge('✓'); }
  } finally { bitmap.close(); }
}

export function pickSave(input: { selectionText?: string; linkUrl?: string; pageTitle?: string; pageUrl?: string }): { text: string; category: NoteCategory } {
  const selection = input.selectionText?.trim();
  if (selection) return { text: selection, category: 'note' };
  if (input.linkUrl) return { text: input.linkUrl, category: 'read' };
  return { text: input.pageTitle?.trim() || input.pageUrl || '', category: 'read' };
}

async function save(text: string, url: string | undefined, title: string | undefined, category: NoteCategory, tabId?: number) {
  const result = await repo.addNote({ category, text: text.trim().slice(0, MAX_TEXT), url: url || null, pageTitle: title || null });
  if (!result.duplicate) {
    await capturePage(result.note.id, tabId);
    await recent.remember(result.note.id);
    void refreshHint(tabId, url ?? null);
  }
  const categories = await repo.listCategories().then(rows => rows.map(({ id, label }) => ({ id, label }))).catch(() => undefined);
  return { ok: true as const, id: result.note.id, duplicate: result.duplicate, category: result.note.category, categories };
}

async function saveAndNotify(tabId: number | undefined, text: string, url: string | undefined, title: string | undefined, category: NoteCategory): Promise<void> {
  let result: Awaited<ReturnType<typeof save>> | undefined;
  try { result = await save(text, url, title, category, tabId); }
  catch (err) { console.debug('[SlapMemo] Kaydedilemedi:', err); }
  try {
    if (tabId === undefined) throw new Error('Sekme yok');
    await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [result ?? { ok: false }, await storedPageTheme()] });
  } catch {
    flashBadge(!result ? '!' : result.duplicate ? '=' : '✓');
  }
}

export function slapMemoMenuContributions(): ContextMenuContribution[] {
  return [{
    id: 'slapmemo', title: 'Not olarak kaydet', contexts: ['selection', 'link', 'page'], moduleId: SLAPMEMO_ID,
    enabled: flags => resolveEnabled(flags, SLAPMEMO_ID),
    onClick: async (info, tab) => {
      if (!(await isModuleEnabled(SLAPMEMO_ID))) return;
      const pageUrl = info.pageUrl || tab?.url;
      const picked = pickSave({ selectionText: info.selectionText, linkUrl: info.linkUrl, pageTitle: tab?.title, pageUrl });
      await saveAndNotify(tab?.id, picked.text, info.linkUrl && !info.selectionText?.trim() ? info.linkUrl : pageUrl, tab?.title, picked.category);
    }
  }, {
    id: 'slapmemo-screenshot', title: 'Ekran görüntüsünü not olarak kaydet', contexts: ['page'], moduleId: SLAPMEMO_ID,
    enabled: flags => resolveEnabled(flags, SLAPMEMO_ID),
    onClick: async (_info, tab) => { try { if (tab) await saveScreenshot(tab); } catch { flashBadge('!'); } }
  }];
}

async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command !== 'save-selection' || !(await isModuleEnabled(SLAPMEMO_ID))) return;
  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!active || active.id === undefined) { flashBadge('!'); return; }
  let selected = '';
  try {
    const results = await chrome.scripting.executeScript({ target: { tabId: active.id }, func: () => String(window.getSelection() ?? '') });
    selected = typeof results[0]?.result === 'string' ? results[0].result : '';
  } catch { /* Kısıtlı sayfalarda sayfa bilgileriyle kaydetmeyi dene. */ }
  const picked = pickSave({ selectionText: selected, pageTitle: active.title, pageUrl: active.url });
  await saveAndNotify(active.id, picked.text, active.url, active.title, picked.category);
}

/** Sayfadaki "Bu sayfada N notun var" ipucunu güncel sayıyla yeniler (kayıt/geri alma sonrası); not kalmadıysa kaldırır. */
async function refreshHint(tabId: number | undefined, noteUrl: string | null): Promise<void> {
  try {
    if (tabId === undefined || !noteUrl) return;
    const settings = await chrome.storage.local.get({ [NOTE_HINT_ENABLED_KEY]: true });
    if (settings[NOTE_HINT_ENABLED_KEY] === false || !(await isModuleEnabled(SLAPMEMO_ID)) || !(await chrome.permissions.contains({ origins: BUBBLE_ORIGINS }))) return;
    const notes = await repo.notesForUrl(noteUrl);
    const theme = await storedPageTheme();
    if (!notes.length) await chrome.scripting.executeScript({ target: { tabId }, func: hideNoteHint });
    else await chrome.scripting.executeScript({ target: { tabId }, func: showNoteHint, args: [{ label: noteCountText(notes.length), notes: notes.slice(0, 5).map(({ text, created_at }) => ({ text, created_at })) }, theme] });
  } catch { /* sayfa kapanmış ya da erişilemez olabilir */ }
}

/** Elle sıralama: kapsamın tam sırasını okuyup yeniden numaralar; tek işlemde, DB kilidi altında. */
export function reorderNotesBackground(ids: number[], category: string | null): Promise<void> {
  return withExclusiveDb(ex => createNotesRepo(ex).reorder(ids, category, { transaction: true }));
}

/** 15 günü geçen çöp notlarını kalıcı siler (görsel, sayfa kopyası, geçmiş dahil); DB kilidi altında. */
export async function purgeExpiredTrash(): Promise<number> {
  if (!(await isModuleEnabled(SLAPMEMO_ID))) return 0;
  return withExclusiveDb(ex => createNotesRepo(ex).purgeExpired());
}

async function syncTrashAlarm(): Promise<void> {
  if (!await chrome.alarms.get(TRASH_PURGE_ALARM)) await chrome.alarms.create(TRASH_PURGE_ALARM, { delayInMinutes: 1, periodInMinutes: 24 * 60 });
}

export function initSlapMemoBackground(): void {
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === TRASH_PURGE_ALARM) void purgeExpiredTrash().catch(err => { console.debug('[SlapMemo] Çöp temizlenemedi:', err); }); });
  chrome.runtime.onInstalled.addListener(() => { void syncTrashAlarm().catch(() => {}); });
  chrome.runtime.onStartup.addListener(() => { void syncTrashAlarm().catch(() => {}); });
  void syncTrashAlarm().catch(() => {});
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status !== 'complete' || tab.incognito || !tab.url || !/^https?:\/\//i.test(tab.url)) return;
    const url = tab.url;
    void (async () => {
      const settings = await chrome.storage.local.get({ [NOTE_HINT_ENABLED_KEY]: true });
      if (settings[NOTE_HINT_ENABLED_KEY] === false || !(await isModuleEnabled(SLAPMEMO_ID)) || !(await chrome.permissions.contains({ origins: BUBBLE_ORIGINS }))) return;
      const notes = await repo.notesForUrl(url);
      if (!notes.length) return;
      const current = await chrome.tabs.get(tabId);
      if (current.incognito || !current.url || normalizeNoteUrl(current.url) !== normalizeNoteUrl(url)) return;
      await chrome.scripting.executeScript({ target: { tabId }, func: showNoteHint, args: [{ label: noteCountText(notes.length), notes: notes.slice(0, 5).map(({ text, created_at }) => ({ text, created_at })) }, await storedPageTheme()] });
    })().catch(() => {});
  });
  let queue: Promise<void> = Promise.resolve();
  const refresh = () => {
    queue = queue.then(async () => {
      const data = await chrome.storage.local.get({ [BUBBLE_ENABLED_KEY]: true });
      const active = data[BUBBLE_ENABLED_KEY] !== false && await isModuleEnabled(SLAPMEMO_ID);
      await replaceSiteScript('slapmemo-bubble', active ? BUBBLE_ORIGINS : [], 'slapmemo-bubble.js', false);
    }).catch(err => { console.debug('[SlapMemo]', err); });
  };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[BUBBLE_ENABLED_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
  chrome.permissions.onAdded.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
  chrome.runtime.onInstalled.addListener(refresh);
  chrome.runtime.onStartup.addListener(refresh);
  refresh();
  setContextMenuContributions(SLAPMEMO_ID, slapMemoMenuContributions());
  chrome.commands.onCommand.addListener((command, tab) => { void handleCommand(command, tab); });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (msg?.type === 'slapmemo:reorder') {
      // Yalnız eklenti sayfalarından (panel).
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false }); return false; }
      const ids: unknown = msg.ids;
      if (!Array.isArray(ids) || !ids.every(id => Number.isSafeInteger(id)) || (msg.category !== null && typeof msg.category !== 'string')) { respond({ ok: false }); return false; }
      void isModuleEnabled(SLAPMEMO_ID).then(enabled => enabled ? reorderNotesBackground(ids as number[], msg.category) : Promise.reject(new Error('kapalı'))).then(() => respond({ ok: true }), () => respond({ ok: false }));
      return true;
    }
    if (msg?.type === 'translate:text') {
      if (!sender.tab || typeof msg.text !== 'string' || !msg.text.trim() || msg.text.length > TRANSLATE_MAX) { respond({ ok: false, error: 'parse' }); return; }
      void translateText(msg.text).then(respond);
      return true;
    }
    if (msg?.type === 'slapmemo:open-panel') {
      if (!sender.tab || sender.tab.incognito || !sender.tab.url || !/^https?:\/\//i.test(sender.tab.url)) return;
      void (async () => {
        const settings = await chrome.storage.local.get({ [NOTE_HINT_ENABLED_KEY]: true });
        if (settings[NOTE_HINT_ENABLED_KEY] === false || !(await isModuleEnabled(SLAPMEMO_ID)) || !(await chrome.permissions.contains({ origins: BUBBLE_ORIGINS }))) return;
        await chrome.tabs.create({ url: chrome.runtime.getURL('panel.html#notlar') });
      })().catch(() => {});
      return;
    }
    if (msg?.type === 'slapmemo:open-search') {
      if (!sender.tab || !Number.isInteger(sender.tab.id) || !Number.isInteger(sender.tab.index) || typeof msg.text !== 'string' || !msg.text.trim() || msg.text.length > 300 || !['search', 'maps'].includes(msg.kind)) return;
      void (async () => {
        if (!(await isModuleEnabled(SLAPMEMO_ID))) return { ok: false };
        const query = encodeURIComponent(msg.text);
        const url = msg.kind === 'maps' ? `https://www.google.com/maps/search/?api=1&query=${query}` : `https://www.google.com/search?q=${query}`;
        await chrome.tabs.create({ url, index: sender.tab!.index + 1, openerTabId: sender.tab!.id });
        return { ok: true };
      })().then(respond).catch(() => respond({ ok: false }));
      return true;
    }
    if (!sender.tab || !['slapmemo:save', 'slapmemo:update', 'slapmemo:undo'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(SLAPMEMO_ID))) return { ok: false };
        if (msg.type === 'slapmemo:save') {
          if (typeof msg.text !== 'string' || (msg.category !== undefined && !(typeof msg.category === 'string' && await repo.categoryExists(msg.category))) || (msg.url !== undefined && typeof msg.url !== 'string') || (msg.title !== undefined && typeof msg.title !== 'string')) return { ok: false };
          return await save(msg.text, msg.url, msg.title, msg.category ?? 'note', sender.tab?.id);
        }
        if (!(await recent.isRecent(msg.id))) return { ok: false };
        if (msg.type === 'slapmemo:undo') {
          const gone = await repo.getNote(msg.id);
          await repo.hardDeleteNote(msg.id);
          await recent.forget(msg.id);
          void refreshHint(sender.tab?.id, gone?.url ?? null);
          return { ok: true };
        }
        if ((msg.category !== undefined && !(typeof msg.category === 'string' && await repo.categoryExists(msg.category))) || (msg.userNote !== undefined && (typeof msg.userNote !== 'string' || msg.userNote.length > 500)) || (msg.category === undefined && msg.userNote === undefined)) return { ok: false };
        if (msg.category !== undefined && !(await repo.setCategory(msg.id, msg.category))) return { ok: false };
        if (msg.userNote !== undefined && !(await repo.updateUserNote(msg.id, msg.userNote))) return { ok: false };
        return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
