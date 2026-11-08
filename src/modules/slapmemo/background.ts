import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { pageToast } from '../../core/page-toast';
import { backgroundDb } from '../../db/host';
import { isNoteCategory, type NoteCategory } from './categories';
import { createNotesRepo } from './repo';

export const SLAPMEMO_ID = 'slapmemo';
const repo = createNotesRepo(backgroundDb);
const recent = new Map<number, number>();
const MAX_TEXT = 5000;
const UNDO_WINDOW = 120_000;

export function pickSave(input: { selectionText?: string; linkUrl?: string; pageTitle?: string; pageUrl?: string }): { text: string; category: NoteCategory } {
  const selection = input.selectionText?.trim();
  if (selection) return { text: selection, category: 'note' };
  if (input.linkUrl) return { text: input.linkUrl, category: 'read' };
  return { text: input.pageTitle?.trim() || input.pageUrl || '', category: 'read' };
}

async function save(text: string, url: string | undefined, title: string | undefined, category: NoteCategory) {
  const result = await repo.addNote({ category, text: text.trim().slice(0, MAX_TEXT), url: url || null, pageTitle: title || null });
  if (!result.duplicate) {
    const now = Date.now();
    for (const [id, created] of recent) if (now - created > UNDO_WINDOW) recent.delete(id);
    recent.set(result.note.id, now);
  }
  return { ok: true as const, id: result.note.id, duplicate: result.duplicate, category: result.note.category };
}

async function saveAndNotify(tabId: number | undefined, text: string, url: string | undefined, title: string | undefined, category: NoteCategory): Promise<void> {
  let result: Awaited<ReturnType<typeof save>> | undefined;
  try { result = await save(text, url, title, category); }
  catch (err) { console.debug('[SlapMemo] Kaydedilemedi:', err); }
  try {
    if (tabId === undefined) throw new Error('Sekme yok');
    await chrome.scripting.executeScript({ target: { tabId }, func: pageToast, args: [result ?? { ok: false }] });
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

function recentId(id: unknown): id is number {
  if (!Number.isSafeInteger(id)) return false;
  const created = recent.get(id as number);
  if (created === undefined) return false;
  if (Date.now() - created > UNDO_WINDOW) { recent.delete(id as number); return false; }
  return true;
}

export function initSlapMemoBackground(): void {
  setContextMenuContributions(SLAPMEMO_ID, slapMemoMenuContributions());
  chrome.commands.onCommand.addListener((command, tab) => { void handleCommand(command, tab); });
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!sender.tab || !['slapmemo:save', 'slapmemo:update', 'slapmemo:undo'].includes(msg?.type)) return;
    void (async () => {
      try {
        if (!(await isModuleEnabled(SLAPMEMO_ID))) return { ok: false };
        if (msg.type === 'slapmemo:save') {
          if (typeof msg.text !== 'string' || (msg.category !== undefined && !isNoteCategory(msg.category)) || (msg.url !== undefined && typeof msg.url !== 'string') || (msg.title !== undefined && typeof msg.title !== 'string')) return { ok: false };
          return await save(msg.text, msg.url, msg.title, msg.category ?? 'note');
        }
        if (!recentId(msg.id)) return { ok: false };
        if (msg.type === 'slapmemo:undo') { await repo.deleteNote(msg.id); recent.delete(msg.id); return { ok: true }; }
        if ((msg.category !== undefined && !isNoteCategory(msg.category)) || (msg.userNote !== undefined && (typeof msg.userNote !== 'string' || msg.userNote.length > 500)) || (msg.category === undefined && msg.userNote === undefined)) return { ok: false };
        if (msg.category !== undefined && !(await repo.setCategory(msg.id, msg.category))) return { ok: false };
        if (msg.userNote !== undefined && !(await repo.updateUserNote(msg.id, msg.userNote))) return { ok: false };
        return { ok: true };
      } catch { return { ok: false }; }
    })().then(respond);
    return true;
  });
}
