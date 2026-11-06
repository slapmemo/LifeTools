import type { LifeModule } from '../../core/module';
import { TAB_LABELS_ID, initTabLabelsBackground } from './background';
export const tabLabelsModule: LifeModule = { id: TAB_LABELS_ID, name: 'Sekme Etiketleri', description: 'Sekmelere etiket ekle.', initBackground: initTabLabelsBackground };
