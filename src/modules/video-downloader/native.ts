import { NATIVE_HOST_NAME } from '../../db/native';
export const UNREACHABLE = 'Masaüstü uygulaması açık ve bağlı olmalı (Ayarlar → Chrome bağlantısı)';
export async function videoCall(op: string, payload: Record<string, unknown> = {}): Promise<Record<string, any>> {
  let response: Record<string, any>;
  try { response = await chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, { id: 1, op, ...payload }); } catch { throw new Error(UNREACHABLE); }
  if (!response || typeof response.ok !== 'boolean') throw new Error(UNREACHABLE);
  if (!response.ok) { const error = new Error(String(response.error || 'İşlem başarısız.')); if (response.code === 'TOOLS_MISSING') error.name = 'TOOLS_MISSING'; throw error; }
  return response;
}
