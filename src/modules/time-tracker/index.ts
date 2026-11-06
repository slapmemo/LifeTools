import type { LifeModule } from '../../core/module';
import { initTimeTrackerBackground, TIME_TRACKER_ID } from './background';
export const timeTrackerModule: LifeModule = { id: TIME_TRACKER_ID, name: 'Web Süre Takibi', description: 'Sitelerde geçirdiğin süreyi gör.', initBackground: initTimeTrackerBackground };
