import type { LifeModule } from '../../core/module';
import { initTimeTrackerBackground, TIME_TRACKER_ID } from './background';
export const timeTrackerModule: LifeModule = { id: TIME_TRACKER_ID, name: 'Web S?re Takibi', description: 'Sitelerde ge?irdi?in s?reyi g?r.', initBackground: initTimeTrackerBackground };
