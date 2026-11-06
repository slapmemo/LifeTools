export interface VideoCandidate { width: number; height: number; playing: boolean; visible: boolean }
export function videoScore(v: VideoCandidate): number { return v.visible ? Math.max(0,v.width)*Math.max(0,v.height) : 0; }
export function selectVideo<T extends VideoCandidate>(videos: T[]): T | undefined { const visible=videos.filter(v=>videoScore(v)>0); const playing=visible.filter(v=>v.playing); return (playing.length ? playing : visible).sort((a,b)=>videoScore(b)-videoScore(a))[0]; }
