import './style.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { mountMain } from './app';
import { mountPicker } from './picker';
import { mountSnippetPicker } from './snippets';
import { mountToast } from './toast';

const root = document.querySelector<HTMLDivElement>('#app')!;
const label = getCurrentWindow().label;
document.body.dataset.view = label;

if (label === 'picker') mountPicker(root);
else if (label === 'snippets') mountSnippetPicker(root);
else if (label === 'toast') mountToast(root);
else mountMain(root);
