import type { LifeModule } from '../../core/module';
import { initSlapMemoBackground, SLAPMEMO_ID } from './background';

export const slapMemoModule: LifeModule = {
  id: SLAPMEMO_ID,
  name: 'SlapMemo',
  description: 'Seçili metni, bağlantıyı veya sayfayı sağ tık ya da Alt+Shift+S ile hızlıca not olarak kaydet.',
  initBackground: initSlapMemoBackground
};
