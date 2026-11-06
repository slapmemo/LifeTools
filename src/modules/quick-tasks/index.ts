import type { LifeModule } from '../../core/module';
import { initQuickTasksBackground, QUICK_TASKS_ID } from './background';
export const quickTasksModule: LifeModule = { id: QUICK_TASKS_ID, name: 'Hızlı Görevler', description: 'Görevlerini hızlıca ekle ve takip et.', initBackground: initQuickTasksBackground };
