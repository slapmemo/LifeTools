import type { LifeModule } from '../../core/module';
import { COMMAND_CENTER_ID, initCommandCenterBackground } from './background';
export const commandCenterModule: LifeModule = { id: COMMAND_CENTER_ID, name: 'Komut Merkezi', description: 'Tek kutudan eylem, sekme, not, görev ve şablon ara; hızlı not ve görev ekle.', initBackground: initCommandCenterBackground };
