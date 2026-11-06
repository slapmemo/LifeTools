import { resolveEnabled } from './module-state';
export const groups = [
 {id:'notlar',label:'Notlar',icon:'notebook-pen',star:true,modules:['slapmemo','watchlist']},
 {id:'gorevler',label:'Görevler',icon:'list-checks',star:true,modules:['quick-tasks']},
 {id:'metin',label:'Metin',icon:'text-cursor-input',star:true,modules:['smart-replies','clip-slots','link-cleaner']},
 {id:'sekmeler',label:'Sekmeler',icon:'layout-grid',star:false,modules:['life-browser','zombie-tabs','pinned-guard','tab-labels','tab-notes','title-cleaner','tab-switcher','site-toolbar']},
 {id:'odak',label:'Odak',icon:'timer',star:false,modules:['site-blocker','time-tracker']},
 {id:'medya',label:'Medya',icon:'clapperboard',star:false,modules:['x-video','pip']},
 {id:'ayarlar',label:'Ayarlar',icon:'settings',star:false,modules:[]}
] as const;
export function categories(flags: unknown) { return groups.filter(g => !g.modules.length || g.modules.some(id => resolveEnabled(flags,id))); }
export function routeCategory(hash: string, visible: readonly {id:string}[]): string { const id = hash.replace(/^#/, ''); return visible.some(g => g.id === id) ? id : (visible.find(g => g.id === 'notlar')?.id ?? visible[0]?.id ?? 'ayarlar'); }
export function popupVisibility(flags: unknown) { return { notes:resolveEnabled(flags,'slapmemo'), tasks:resolveEnabled(flags,'quick-tasks'), sites:resolveEnabled(flags,'time-tracker'), search:resolveEnabled(flags,'command-center') }; }
