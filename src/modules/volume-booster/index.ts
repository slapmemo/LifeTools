import type { LifeModule } from '../../core/module';
import { initVolumeBackground } from './background';
export const volumeBoosterModule: LifeModule = { id: 'volume-booster', name: 'Ses Yükseltici', description: 'Sekmenin ses düzeyini ayarla.', initBackground: initVolumeBackground };
