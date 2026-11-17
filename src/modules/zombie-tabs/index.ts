import type { LifeModule } from '../../core/module';
import { initZombieTabsBackground, ZOMBIE_TABS_ID } from './background';
export const zombieTabsModule: LifeModule = { id: ZOMBIE_TABS_ID, name: 'Zombi Sekme Temizleyici', description: 'Uzun süredir açılmayan sekmeleri bul; kapat veya kayıtlı gruba taşı.', initBackground: initZombieTabsBackground };
