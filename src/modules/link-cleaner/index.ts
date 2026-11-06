import type { LifeModule } from '../../core/module';
import { initLinkCleanerBackground, LINK_CLEANER_ID } from './background';

export const linkCleanerModule: LifeModule = {
  id: LINK_CLEANER_ID,
  name: 'Link Temizleyici',
  description: 'Bağlantılardaki izleme parametrelerini kaldır ve temiz linki kopyala.',
  initBackground: initLinkCleanerBackground
};
