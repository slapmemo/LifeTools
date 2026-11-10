import { DESKTOP_UNREACHABLE, NATIVE_HOST_NAME } from '../../db/native';
import { nativeRequest } from '../../db/host';
import { videoNativeError } from '../../core/version';
export const UNREACHABLE = 'Masaüstü uygulaması açık ve bağlı olmalı (Ayarlar → Chrome bağlantısı)';
export async function videoCall(op: string, payload: Record<string, unknown> = {}): Promise<Record<string, any>> {
  let response: Record<string, any>;
  const oneShot = async (): Promise<Record<string, any>> => {
    try { return await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { id: 1, op, ...payload }); }
    catch { throw new Error(UNREACHABLE); }
  };
  if (op === 'video_pick_folder' || op === 'video_formats') response = await oneShot();
  else {
    try { response = await nativeRequest({ op, ...payload }); }
    catch (err) {
      if (err instanceof Error && err.message === DESKTOP_UNREACHABLE) response = await oneShot();
      else {
        const error = new Error(videoNativeError(err instanceof Error ? err.message : String(err)));
        if (err instanceof Error && err.name === 'TOOLS_MISSING') error.name = 'TOOLS_MISSING';
        throw error;
      }
    }
  }
  if (!response || typeof response.ok !== 'boolean') throw new Error(UNREACHABLE);
  if (!response.ok) { const error = new Error(videoNativeError(String(response.error || 'İşlem başarısız.'))); if (response.code === 'TOOLS_MISSING') error.name = 'TOOLS_MISSING'; throw error; }
  return response;
}
