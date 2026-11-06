/** Her araç (modül) kendini bu arayüzle tanıtır. */
export interface LifeModule {
  /** Kalıcı kimlik; chrome.storage anahtarlarında kullanılır. */
  id: string;
  /** Türkçe görünen ad. */
  name: string;
  /** Kısa Türkçe açıklama. */
  description: string;
  /**
   * Service worker açılışında (üst düzeyde, eşzamanlı) bir kez çağrılır.
   * Dinleyiciler burada kaydedilir; modül kapalıyken dinleyiciler hiçbir şey yapmamalıdır.
   */
  initBackground(): void;
}
