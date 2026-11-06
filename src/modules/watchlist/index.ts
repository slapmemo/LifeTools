import type { LifeModule } from '../../core/module';
import { WATCHLIST_ID, initWatchlistBackground } from './background';
export const watchlistModule: LifeModule = { id: WATCHLIST_ID, name: 'İzleme Listesi', description: 'İzlemek istediklerini takip et.', initBackground: initWatchlistBackground };
