import type { LifeModule } from '../../core/module';
import { CLIP_SLOTS_ID, initClipSlotsBackground } from './background';
export const clipSlotsModule: LifeModule = { id: CLIP_SLOTS_ID, name: 'Pano Yuvaları', description: 'Beş metin yuvasını kaydet ve kullan.', initBackground: initClipSlotsBackground };
