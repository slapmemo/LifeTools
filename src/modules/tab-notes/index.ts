import type { LifeModule } from '../../core/module';
import { TAB_NOTES_ID, initTabNotesBackground } from './background';
export const tabNotesModule: LifeModule = { id: TAB_NOTES_ID, name: 'Sekme Notları', description: 'Sekmelere kısa notlar ekle.', initBackground: initTabNotesBackground };
