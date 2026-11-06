import type { LifeModule } from '../../core/module';
import { initShortcutsBackground, SHORTCUTS_ID } from './background';
export const shortcutsModule: LifeModule = { id: SHORTCUTS_ID, name: 'Kısayol Oluşturucu', description: 'LifeTools komutlarını ve kısayol atamalarını gör; Chrome kısayol sayfasına git.', initBackground: initShortcutsBackground };
