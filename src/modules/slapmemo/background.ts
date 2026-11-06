import { flashBadge } from '../../core/badge';
import { setContextMenuContributions, type ContextMenuContribution, type MenuContext } from '../../core/context-menu';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { backgroundDb } from '../../db/host';
import type { NoteCategory } from './categories';
import { CATEGORY_LABELS, isNoteCategory, NOTE_CATEGORIES } from './categories';
import { createNotesRepo } from './repo';

export const SLAPMEMO_ID = 'slapmemo';

const MENU_ROOT = 'slapmemo';
const MENU_PREFIX = 'slapmemo:';
const COMMAND_SAVE_SELECTION = 'save-selection';
const MAX_TEXT = 5000;

const CONTEXTS: readonly MenuContext[] = ['selection', 'page'];

const repo = createNotesRepo(backgroundDb);

async function save(category: NoteCategory, rawText: string, url: string | undefined, title: string | undefined): Promise<void> {
  const text = rawText.trim().slice(0, MAX_TEXT);
  if (!text) { flashBadge('!'); return; }
  try {
    const { duplicate } = await repo.addNote({ category, text, url: url || null, pageTitle: title || null });
    flashBadge(duplicate ? '=' : '✓');
  } catch (err) {
    console.debug('[SlapMemo] Kaydedilemedi:', err);
    flashBadge('!');
  }
}

export function slapMemoMenuContributions(): ContextMenuContribution[] {
  const items: ContextMenuContribution[] = [
    {
      id: MENU_ROOT,
      title: "SlapMemo'ya kaydet",
      contexts: CONTEXTS,
      moduleId: SLAPMEMO_ID,
      enabled: flags => resolveEnabled(flags, SLAPMEMO_ID)
    }
  ];
  for (const category of NOTE_CATEGORIES) {
    items.push({
      id: MENU_PREFIX + category,
      parent: MENU_ROOT,
      title: CATEGORY_LABELS[category],
      contexts: CONTEXTS,
      moduleId: SLAPMEMO_ID,
      enabled: flags => resolveEnabled(flags, SLAPMEMO_ID),
      onClick: async (info, tab) => {
        if (!isNoteCategory(category) || !(await isModuleEnabled(SLAPMEMO_ID))) return;
        const pageUrl = info.pageUrl || tab?.url;
        const title = tab?.title;
        const text = info.selectionText?.trim() || info.linkUrl || title || pageUrl || '';
        await save(category, text, pageUrl, title);
      }
    });
  }
  return items;
}

async function handleCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command !== COMMAND_SAVE_SELECTION) return;
  if (!(await isModuleEnabled(SLAPMEMO_ID))) return;

  try {
    const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!active || active.id === undefined) { flashBadge('!'); return; }
    const results = await chrome.scripting.executeScript({
      target: { tabId: active.id },
      func: () => String(window.getSelection() ?? '')
    });
    const selected = typeof results[0]?.result === 'string' ? (results[0].result as string) : '';
    await save('note', selected, active.url, active.title);
  } catch (err) {
    // chrome:// gibi kısıtlı sayfalarda okuma yapılamaz.
    console.debug('[SlapMemo] Seçim okunamadı:', err);
    flashBadge('!');
  }
}

/** Dinleyicileri kaydeder (service worker üst düzeyinde çağrılmalı). */
export function initSlapMemoBackground(): void {
  setContextMenuContributions(SLAPMEMO_ID, slapMemoMenuContributions());
  chrome.commands.onCommand.addListener((command, tab) => { void handleCommand(command, tab); });
}
