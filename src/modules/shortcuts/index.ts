import type { LifeModule } from '../../core/module';
import { initShortcutsBackground, SHORTCUTS_ID } from './background';
export const shortcutsModule: LifeModule = { id: SHORTCUTS_ID, name: 'Kısayollar', description: 'LifeTools kısayollarını görüntüle ve Chrome ayarlarından değiştir.', initBackground: initShortcutsBackground };
