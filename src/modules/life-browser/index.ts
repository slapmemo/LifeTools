import type { LifeModule } from '../../core/module';
import { initLifeBrowserBackground, LIFE_BROWSER_ID } from './background';
export const lifeBrowserModule: LifeModule = { id: LIFE_BROWSER_ID, name: 'LifeBrowser', description: 'Sekme oturumlarını kaydet, siteye göre grupla, kopyaları kapat.', initBackground: initLifeBrowserBackground };
