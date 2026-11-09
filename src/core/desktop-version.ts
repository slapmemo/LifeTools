import { NATIVE_HOST_NAME, type PingInfo } from '../db/native';
import { desktopVersionWarning } from './version';

export async function desktopVersion(): Promise<PingInfo | null> {
  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { id: 1, op: 'ping' });
    return response?.ok && typeof response.version === 'string' ? response as PingInfo : null;
  } catch {
    return null;
  }
}

export async function showVersions(status: HTMLElement, warning: HTMLElement): Promise<void> {
  const extension = chrome.runtime.getManifest().version;
  status.textContent = `Sürüm ${extension} · Masaüstü: bağlı değil`;
  const desktop = await desktopVersion();
  status.textContent = `Sürüm ${extension} · Masaüstü: ${desktop ? `v${desktop.version}` : 'bağlı değil'}`;
  warning.textContent = desktop ? desktopVersionWarning(desktop.version, extension) : '';
  warning.hidden = !warning.textContent;
}
