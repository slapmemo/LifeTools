export const CLIP_SLOTS_KEY = 'clipSlots';
export const SLOT_IDS = ['A','B','C','D','E'] as const;
export interface Slot { label: string; text: string }
export function normalizeSlots(raw: unknown): Slot[] { const a = Array.isArray(raw) ? raw : []; return SLOT_IDS.map((_,i) => { const v = a[i]; return { label: typeof v?.label === 'string' ? v.label.slice(0,100) : '', text: typeof v?.text === 'string' ? v.text.slice(0,10000) : '' }; }); }
export async function getSlots(): Promise<Slot[]> { return normalizeSlots((await chrome.storage.local.get(CLIP_SLOTS_KEY))[CLIP_SLOTS_KEY]); }
