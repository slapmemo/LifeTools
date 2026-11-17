/**
 * "Bu pencere elle kaydedilip kapatıldı" işareti. Arka plandaki otomatik kapanış kaydı bunu görünce pencereyi
 * ikinci kez kaydetmez. Sayfalar da kullandığı için arka plan modülünden ayrı tutulur (sayfaya arka plan kodu girmesin).
 */
export const closedKey = (windowId: number): string => `lifeBrowserClosed:${windowId}`;

/** Elle kaydedilip kapatılan pencereyi otomatik kapanış kaydından çıkarır. */
export async function suppressAutoSaveForWindow(windowId: number): Promise<void> {
  await chrome.storage.session.set({ [closedKey(windowId)]: true });
}
