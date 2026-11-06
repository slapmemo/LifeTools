import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { flashBadge } from '../../core/badge';
import { backgroundDb } from '../../db/host';
import type { NoteCategory } from './categories';
import { CATEGORY_LABELS, isNoteCategory, NOTE_CATEGORIES } from './categories';
import { createNotesRepo } from './repo';

export const SLAPMEMO_ID = 'slapmemo';

const MENU_ROOT = 'slapmemo';
const MENU_PREFIX = 'slapmemo:';
const COMMAND_SAVE_SELECTION = 'save-selection';
const MAX_TEXT = 5000;

const CONTEXTS: [chrome.contextMenus.ContextType, ...chrome.contextMenus.ContextType[]] = [
  'selection',
  'link',
  'page'
];

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

function createMenu(props: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise(resolve => {
    chrome.contextMenus.create(props, () => {
      void chrome.runtime.lastError; // Yinelenen kimlik vb. hatalar sessizce yutulur.
      resolve();
    });
  });
}

function removeMenu(id: string): Promise<void> {
  return new Promise(resolve => {
    chrome.contextMenus.remove(id, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

let menuSync: Promise<void> = Promise.resolve();

/** Menüleri modül durumuna göre kurar; kapalıysa kaldırır. Çağrılar sıraya alınır. */
function syncMenus(): Promise<void> {
  menuSync = menuSync.then(async () => {
    try {
      if (await isModuleEnabled(SLAPMEMO_ID)) {
        await createMenu({ id: MENU_ROOT, title: "SlapMemo'ya kaydet", contexts: CONTEXTS });
        for (const category of NOTE_CATEGORIES) {
          await createMenu({
            id: MENU_PREFIX + category,
            parentId: MENU_ROOT,
            title: CATEGORY_LABELS[category],
            contexts: CONTEXTS
          });
        }
      } else {
        for (const category of NOTE_CATEGORIES) {
          await removeMenu(MENU_PREFIX + category);
        }
        await removeMenu(MENU_ROOT);
      }
    } catch (err) {
      console.debug('[SlapMemo] Menüler kurulamadı:', err);
    }
  });
  return menuSync;
}

async function handleMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const id = String(info.menuItemId);
  if (!id.startsWith(MENU_PREFIX)) return;
  const category = id.slice(MENU_PREFIX.length);
  if (!isNoteCategory(category)) return;
  if (!(await isModuleEnabled(SLAPMEMO_ID))) return;

  const pageUrl = info.pageUrl || tab?.url;
  const title = tab?.title;
  const text = info.selectionText?.trim() || info.linkUrl || title || pageUrl || '';
  await save(category, text, pageUrl, title);
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
  chrome.contextMenus.onClicked.addListener((info, tab) => { void handleMenuClick(info, tab); });
  chrome.commands.onCommand.addListener((command, tab) => { void handleCommand(command, tab); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MODULE_FLAGS_KEY]) void syncMenus();
  });
  chrome.runtime.onInstalled.addListener(() => { void syncMenus(); });
  chrome.runtime.onStartup.addListener(() => { void syncMenus(); });
}
