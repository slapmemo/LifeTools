import type { LifeModule } from '../../core/module';
import { X_VIDEO_ID } from './shared';
import { initXVideoBackground } from './background';
export const xVideoModule: LifeModule = { id:X_VIDEO_ID, name:'X Video İndirici', description:'X üzerindeki videoları indir.', initBackground:initXVideoBackground };
