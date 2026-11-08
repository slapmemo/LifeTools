import type { LifeModule } from '../../core/module';
import { INSTAGRAM_ID } from './shared';
import { initInstagramBackground } from './background';
export const instagramModule: LifeModule = { id: INSTAGRAM_ID, name: 'Instagram', description: 'Instagram videolarını indir.', initBackground: initInstagramBackground };
