import type { LifeModule } from '../../core/module';
import { initTabManagerBackground } from './background';
import { initLifeBrowserBackground } from '../life-browser/background';

export const tabManagerModule: LifeModule = {
  id: 'tab-manager',
  name: 'Sekme Yöneticisi',
  description: 'Açık sekmeleri yönet, seçtiklerini veya tüm pencereyi kaydet, kayıtlı grupları düzenle.',
  initBackground(): void {
    initTabManagerBackground();
    initLifeBrowserBackground();
  }
};
