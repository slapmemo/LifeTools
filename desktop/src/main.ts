import '../../design/tokens.css';
import '../../design/components.css';
import './style.css';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { api } from './api';
import { mountMain } from './app';
import { mountPicker } from './picker';
import { applyCachedTheme, applyTheme, bindThemeListener, normalizeTheme } from './views/ayarlar';
import { mountSnippetPicker } from './views/sablonlar';
import { mountToast } from './toast';

// İlk boyamadan önce data-theme özniteliğini uygula (get_setting / set_setting ile senkron)
const initialTheme = applyCachedTheme();
if (initialTheme === 'system') document.documentElement.removeAttribute('data-theme');
else document.documentElement.setAttribute('data-theme', initialTheme);
void api.getSetting('theme').then((v) => applyTheme(normalizeTheme(v))).catch(() => undefined);
bindThemeListener();

const root = document.querySelector<HTMLDivElement>('#app')!;
const label = getCurrentWindow().label;
document.body.dataset.view = label;

if (label === 'picker') mountPicker(root);
else if (label === 'snippets') mountSnippetPicker(root);
else if (label === 'toast') mountToast(root);
else mountMain(root);
