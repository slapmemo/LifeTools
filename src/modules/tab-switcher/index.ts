import type { LifeModule } from '../../core/module';
import { TAB_SWITCHER_ID, initTabSwitcherBackground } from './background';
export const tabSwitcherModule: LifeModule = { id: TAB_SWITCHER_ID, name: 'Görsel Sekme Değiştirici', description: 'Sekmeleri ara ve aralarında geçiş yap.', initBackground: initTabSwitcherBackground };
