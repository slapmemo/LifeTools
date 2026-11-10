import type { LifeModule } from '../../core/module';
import { CURRENCY_ID, initCurrencyBackground } from './background';
export const currencyModule: LifeModule = { id: CURRENCY_ID, name: 'Döviz Çevirici', description: 'Yabancı para fiyatlarını güncel kurla TL olarak gösterir.', initBackground: initCurrencyBackground };
