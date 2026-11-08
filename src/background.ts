import { registerDbBridge } from './db/host';
import { modules } from './modules';
import './core/builtin-actions';
import { registerActionBridge } from './core/action-runtime';
import { initContextMenuBackground } from './core/context-menu';
import { initAutoBackup } from './core/auto-backup-background';

// Dinleyiciler service worker üst düzeyinde, eşzamanlı kaydedilmelidir.
for (const module of modules) module.initBackground();
initContextMenuBackground();
registerDbBridge();
registerActionBridge();
initAutoBackup();
