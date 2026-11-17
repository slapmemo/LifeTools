/**
 * "Bu pencere zaten kaydedildi" işareti. Arka plandaki otomatik kapanış kaydı bunu görünce pencereyi
 * ikinci kez kaydetmez.
 */
export const closedKey = (windowId: number): string => `lifeBrowserClosed:${windowId}`;
