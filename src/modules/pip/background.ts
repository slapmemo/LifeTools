import { isModuleEnabled } from '../../core/module-state';
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
export function initPipBackground(): void { chrome.commands.onCommand.addListener((command,tab)=>{ if(command!=='toggle-pip') return; void (async()=>{ if(!await isModuleEnabled(PIP_ID)) return; const target=tab ?? (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]; if(target?.id!==undefined) await togglePip(target.id); })().catch(()=>{}); }); }
