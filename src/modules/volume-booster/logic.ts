export function clampPercent(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(600, value)) : 100; }
export function percentToGain(value: number): number { return clampPercent(value) / 100; }
export function setVolume(state: Map<number, number>, tabId: number, value: number): void { state.set(tabId, clampPercent(value)); }
export function removeVolume(state: Map<number, number>, tabId: number): void { state.delete(tabId); }
