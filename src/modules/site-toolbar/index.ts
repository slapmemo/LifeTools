import type { LifeModule } from '../../core/module';
import { initSiteToolbarBackground, SITE_TOOLBAR_ID } from './background';
export const siteToolbarModule: LifeModule = { id: SITE_TOOLBAR_ID, name: 'Site Araç Çubuğu', description: 'Seçtiğin sitelerde, istediğin eylemleri içeren küçük ve sürüklenebilir bir araç çubuğu göster.', initBackground: initSiteToolbarBackground };
