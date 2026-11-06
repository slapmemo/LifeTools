import { tabLabelsModule } from './tab-labels';
import { tabNotesModule } from './tab-notes';
import { tabSwitcherModule } from './tab-switcher';
import { titleCleanerModule } from './title-cleaner';
import { timeTrackerModule } from './time-tracker';
import { quickTasksModule } from './quick-tasks';
import { smartRepliesModule } from './smart-replies';
import { linkCleanerModule } from './link-cleaner';
import type { LifeModule } from '../core/module';
import { siteBlockerModule } from './site-blocker';
import { slapMemoModule } from './slapmemo';
import { lifeBrowserModule } from './life-browser';
import { zombieTabsModule } from './zombie-tabs';
import { pinnedGuardModule } from './pinned-guard';

/** Tüm araçların kaydı. Yeni araç buraya eklenir. */
export const modules: readonly LifeModule[] = [timeTrackerModule, siteBlockerModule, slapMemoModule, linkCleanerModule, smartRepliesModule, quickTasksModule, lifeBrowserModule, zombieTabsModule, pinnedGuardModule, tabLabelsModule, tabNotesModule, tabSwitcherModule, titleCleanerModule];
