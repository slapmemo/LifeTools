import type { LifeModule } from '../../core/module';
import { initTabManagerBackground } from './background';
export const tabManagerModule: LifeModule = { id: 'tab-manager', name: 'Sekme Yöneticisi', description: 'Sekmeleri seç, gruplara al, grup adını ve rengini değiştir.', initBackground: initTabManagerBackground };
