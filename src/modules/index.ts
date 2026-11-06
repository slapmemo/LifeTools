import { timeTrackerModule } from './time-tracker';
import { quickTasksModule } from './quick-tasks';
import { smartRepliesModule } from './smart-replies';
import { linkCleanerModule } from './link-cleaner';
import type { LifeModule } from '../core/module';
import { siteBlockerModule } from './site-blocker';
import { slapMemoModule } from './slapmemo';

/** Tüm araçların kaydı. Yeni araç buraya eklenir. */
export const modules: readonly LifeModule[] = [timeTrackerModule, siteBlockerModule, slapMemoModule, linkCleanerModule, smartRepliesModule, quickTasksModule];
