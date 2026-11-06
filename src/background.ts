import { registerDbBridge } from './db/host';
import { modules } from './modules';
import './core/builtin-actions';
import { registerActionBridge } from './core/action-runtime';

// Dinleyiciler service worker üst düzeyinde, eşzamanlı kaydedilmelidir.
for (const module of modules) module.initBackground();
registerDbBridge();
registerActionBridge();
