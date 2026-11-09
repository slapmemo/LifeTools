import { isModuleEnabled, MODULE_FLAGS_KEY } from '../../core/module-state';
import { replaceSiteScript } from '../../core/site-scripts';
import { PIP_HOVER_ENABLED_KEY, PIP_HOVER_ORIGINS } from './hover-logic';
import { flashBadge } from '../../core/badge';
import { selectVideo } from './scoring';
export const PIP_ID = 'pip';
export async function togglePip(tabId: number): Promise<string> {
 try {
 const frames=await chrome.scripting.executeScript({target:{tabId,allFrames:true},func:()=>({ pip: !!document.pictureInPictureElement, videos: Array.from(document.querySelectorAll('video')).map((v,index)=>{const r=v.getBoundingClientRect(); const style=getComputedStyle(v); return {index,width:r.width,height:r.height,visible:r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none',playing:!v.paused&&!v.ended};}) })});
 const active=frames.find(f=>f.result?.pip); if(active) { await chrome.scripting.executeScript({target:{tabId,frameIds:[active.frameId]},func:async()=>{await document.exitPictureInPicture();}}); return 'Resim içinde resim kapatıldı.'; }
 const candidates=frames.flatMap(f=>(f.result?.videos ?? []).map(v=>({...v,frameId:f.frameId}))); const chosen=selectVideo(candidates); if(!chosen) throw new Error('Görünür video bulunamadı.');
 const result=await chrome.scripting.executeScript({target:{tabId,frameIds:[chosen.frameId]},args:[chosen.index],func:async(index:number)=>{const video=document.querySelectorAll('video')[index]; if(!video) return 'Video bulunamadı.'; if(video.disablePictureInPicture) return 'Bu video resim içinde resme izin vermiyor.'; try { await video.requestPictureInPicture(); return ''; } catch { return 'Resim içinde resim açılamadı.'; } }}); if(result[0]?.result) throw new Error(result[0].result); return 'Resim içinde resim açıldı.';
 } catch(e) { flashBadge('!'); throw e; }
}
export function initPipBackground(): void {
 let queue: Promise<void> = Promise.resolve();
 const refresh = () => { queue = queue.then(async () => {
  const data = await chrome.storage.local.get({ [PIP_HOVER_ENABLED_KEY]: true });
  const active = data[PIP_HOVER_ENABLED_KEY] !== false && await isModuleEnabled(PIP_ID);
  await replaceSiteScript('pip-hover-button', active ? PIP_HOVER_ORIGINS : [], 'pip-hover-button.js', true);
 }).catch(err => { console.debug('[PiP]', err); }); };
 chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (changes[PIP_HOVER_ENABLED_KEY] || changes[MODULE_FLAGS_KEY])) refresh(); });
 chrome.permissions.onAdded.addListener(refresh);
  chrome.permissions.onRemoved.addListener(refresh);
 chrome.runtime.onInstalled.addListener(refresh);
 chrome.runtime.onStartup.addListener(refresh);
 refresh();
 chrome.commands.onCommand.addListener((command,tab)=>{ if(command!=='toggle-pip') return; void (async()=>{ if(!await isModuleEnabled(PIP_ID)) return; const target=tab ?? (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]; if(target?.id!==undefined) await togglePip(target.id); })().catch(()=>{}); });
}
