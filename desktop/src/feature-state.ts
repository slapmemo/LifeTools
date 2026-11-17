import { api } from './api';
import { ambient } from './ambient';
import { DESKTOP_FEATURES_KEY, desktopFeatureEnabled, parseDesktopFlags, type DesktopFeatureId } from '../../src/core/desktop-features';

/** Özelliklerin aç/kapat durumu. Rust da aynı ayarı okur (features.rs): kapalı özellik arka planda da durur. */
let flags: Record<string, boolean> = {};

export const FEATURES_CHANGED = 'lifetools:features-changed';

export async function loadFeatureFlags(): Promise<void> {
  flags = parseDesktopFlags(await api.getSetting(DESKTOP_FEATURES_KEY).catch(() => null));
}

export function isOn(id: string): boolean {
  return desktopFeatureEnabled(flags, id);
}

export async function setFeatures(changes: Partial<Record<DesktopFeatureId, boolean>>): Promise<void> {
  const next = { ...flags, ...changes };
  await api.setSetting(DESKTOP_FEATURES_KEY, JSON.stringify(next));
  flags = next;
  if (changes.ortam === false && ambient.playing) ambient.stop();
  window.dispatchEvent(new Event(FEATURES_CHANGED));
}
