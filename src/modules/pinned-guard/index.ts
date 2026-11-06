import type { LifeModule } from '../../core/module';
import { initPinnedGuardBackground, PINNED_GUARD_ID } from './background';
export const pinnedGuardModule: LifeModule = { id: PINNED_GUARD_ID, name: 'Sabit Sekme Koruyucu', description: 'Sabit sekme kapanınca haber verir ve tek tıkla geri açar.', initBackground: initPinnedGuardBackground };
