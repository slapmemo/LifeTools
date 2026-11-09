import type { LifeModule } from '../../core/module';
import { initVideoBackground } from './background';
import { VIDEO_ID } from './logic';
export const videoDownloaderModule: LifeModule = { id: VIDEO_ID, name: 'Video İndirici', description: 'Videoları masaüstü uygulamasıyla indir.', initBackground: initVideoBackground };
