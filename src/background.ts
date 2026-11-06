import { registerDbBridge } from './db/host';
import { modules } from './modules';

// Dinleyiciler service worker üst düzeyinde, eşzamanlı kaydedilmelidir.
for (const module of modules) module.initBackground();
registerDbBridge();
