import type { LifeModule } from '../../core/module';
import { PIP_ID, initPipBackground } from './background';
export const pipModule: LifeModule = { id: PIP_ID, name: 'Resim içinde resim', description: 'Etkin sekmedeki videoyu küçük pencerede aç.', initBackground: initPipBackground };
