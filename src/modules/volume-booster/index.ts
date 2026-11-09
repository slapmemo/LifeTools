import type { LifeModule } from '../../core/module';
import { initVolumeBackground } from './background';
export const volumeBoosterModule: LifeModule = { id: 'volume-booster', name: 'Ses Y?kseltici', description: 'Sekmenin ses d?zeyini ayarla.', initBackground: initVolumeBackground };
