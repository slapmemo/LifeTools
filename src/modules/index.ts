import { volumeBoosterModule } from './volume-booster';
import { xVideoModule } from './x-video';
import { instagramModule } from './instagram';
import { watchlistModule } from './watchlist';
import { pipModule } from './pip';
import { clipSlotsModule } from './clip-slots';
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
import { commandCenterModule } from './command-center';
import { shortcutsModule } from './shortcuts';
import { siteToolbarModule } from './site-toolbar';
import { tabManagerModule } from './tab-manager';
import { videoDownloaderModule } from './video-downloader';
import { currencyModule } from './currency';

/** Tüm araçların kaydı. Yeni araç buraya eklenir. */
export const modules: readonly LifeModule[] = [currencyModule, videoDownloaderModule, volumeBoosterModule, xVideoModule, instagramModule, watchlistModule, pipModule, clipSlotsModule, timeTrackerModule, siteBlockerModule, slapMemoModule, linkCleanerModule, smartRepliesModule, quickTasksModule, lifeBrowserModule, zombieTabsModule, pinnedGuardModule, tabLabelsModule, tabNotesModule, tabSwitcherModule, tabManagerModule, titleCleanerModule, commandCenterModule, shortcutsModule, siteToolbarModule];
