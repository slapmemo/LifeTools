import type { LifeModule } from '../../core/module';
import { initSmartRepliesBackground, SMART_REPLIES_ID } from './background';
export const smartRepliesModule: LifeModule = { id: SMART_REPLIES_ID, name: 'Akıllı Yanıtlar', description: 'Şablonları sağ tıkla ekle veya seçtiğin sitelerde yazarken genişlet.', initBackground: initSmartRepliesBackground };
