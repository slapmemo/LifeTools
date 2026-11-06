import { registerDbBridge } from './db/host';
import { modules } from './modules';
import './core/builtin-actions';
import { registerActionBridge } from './core/action-runtime';
import { initContextMenuBackground } from './core/context-menu';

// Dinleyiciler service worker üst düzeyinde, eşzamanlı kaydedilmelidir.
for (const module of modules) module.initBackground();
initContextMenuBackground();
registerDbBridge();
registerActionBridge();
