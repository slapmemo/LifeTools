import { flashBadge } from '../../core/badge';
import {
  registerContextMenuLoader,
  scheduleContextMenuRebuild,
  setContextMenuContributions,
  type ContextMenuContribution
} from '../../core/context-menu';
import { insertText } from '../../core/insert-text';
import { isModuleEnabled, resolveEnabled } from '../../core/module-state';
import { CLIP_SLOTS_KEY, getSlots, normalizeSlots, SLOT_IDS, type Slot } from './slots';

export const CLIP_SLOTS_ID = 'clip-slots';
const PASTE_MENU = 'clip:paste';
const SAVE_MENU = 'clip:save';

export function clipSlotsMenuContributions(slots: readonly Slot[]): ContextMenuContribution[] {
  const normalized = normalizeSlots(slots);
  const items: ContextMenuContribution[] = [
    {
      id: SAVE_MENU,
      title: 'Yuvaya kaydet',
      contexts: ['selection'],
      moduleId: CLIP_SLOTS_ID,
      enabled: flags => resolveEnabled(flags, CLIP_SLOTS_ID)
    }
  ];

  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotIndex = i;
    items.push({
      id: `${SAVE_MENU}:${slotIndex}`,
      parent: SAVE_MENU,
      title: SLOT_IDS[slotIndex],
      contexts: ['selection'],
      moduleId: CLIP_SLOTS_ID,
      enabled: flags => resolveEnabled(flags, CLIP_SLOTS_ID),
      onClick: async info => {
        if (!(await isModuleEnabled(CLIP_SLOTS_ID))) return;
        try {
          const current = await getSlots();
          current[slotIndex].text = (info.selectionText ?? '').slice(0, 10_000);
          await chrome.storage.local.set({ [CLIP_SLOTS_KEY]: current });
          flashBadge('✓');
        } catch {
          flashBadge('!');
        }
      }
    });
  }

  items.push({
    id: PASTE_MENU,
    title: 'Yuvadan yapıştır',
    contexts: ['editable'],
    moduleId: CLIP_SLOTS_ID,
    enabled: flags => resolveEnabled(flags, CLIP_SLOTS_ID) && normalized.some(s => Boolean(s.text))
  });

  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slotIndex = i;
    const slot = normalized[slotIndex];
    items.push({
      id: `${PASTE_MENU}:${slotIndex}`,
      parent: PASTE_MENU,
      title: SLOT_IDS[slotIndex] + (slot?.label ? ` — ${slot.label}` : ''),
      contexts: ['editable'],
      moduleId: CLIP_SLOTS_ID,
      enabled: flags => resolveEnabled(flags, CLIP_SLOTS_ID) && Boolean(slot?.text),
      onClick: async (info, tab) => {
        if (!(await isModuleEnabled(CLIP_SLOTS_ID))) return;
        try {
          const current = await getSlots();
          const text = current[slotIndex]?.text;
          if (tab?.id === undefined || !text) return;
          const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
            func: insertText,
            args: [text]
          });
          if (!result[0]?.result) throw new Error('Yapıştırılamadı.');
          flashBadge('✓');
        } catch {
          flashBadge('!');
        }
      }
    });
  }

  return items;
}

export function initClipSlotsBackground(): void {
  setContextMenuContributions(CLIP_SLOTS_ID, clipSlotsMenuContributions([]));
  registerContextMenuLoader(CLIP_SLOTS_ID, async () => {
    const slots = await getSlots();
    setContextMenuContributions(CLIP_SLOTS_ID, clipSlotsMenuContributions(slots));
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[CLIP_SLOTS_KEY]) {
      scheduleContextMenuRebuild();
    }
  });
  scheduleContextMenuRebuild();
}
