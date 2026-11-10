import { DESKTOP_UNREACHABLE, NATIVE_HOST_NAME, type PingInfo } from '../db/native';
import { nativeRequest } from '../db/host';
import { desktopVersionWarning } from './version';

export async function desktopVersion(): Promise<PingInfo | null> {
  try {
    let response;
    try { response = await nativeRequest({ op: 'ping' }); }
    catch (err) {
      if (!(err instanceof Error) || err.message !== DESKTOP_UNREACHABLE) return null;
      response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { id: 1, op: 'ping' });
    }
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
  if (!warning.textContent) {
    try {
      const hint = (await chrome.storage.local.get('selfUpdate.unmanagedDir'))['selfUpdate.unmanagedDir'];
      if (typeof hint === 'string' && hint) warning.textContent = `Otomatik güncelleme için eklentiyi masaüstünün eklenti klasöründen yükle: ${hint}`;
    } catch {
      /* depolama kullanılamıyor */
    }
  }
  warning.hidden = !warning.textContent;
}
