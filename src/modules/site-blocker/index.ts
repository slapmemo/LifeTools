import type { LifeModule } from '../../core/module';
import { initSiteBlockerBackground, SITE_BLOCKER_ID } from './background';

export const siteBlockerModule: LifeModule = {
  id: SITE_BLOCKER_ID,
  name: 'Site Engelleyici',
  description: 'Seçtiğin X/Twitter profillerini engel sayfasında açar.',
  initBackground: initSiteBlockerBackground
};
