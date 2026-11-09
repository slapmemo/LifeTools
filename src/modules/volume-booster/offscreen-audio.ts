import { percentToGain, setVolume, removeVolume } from './logic';
const graphs = new Map<number, { stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode; origin: string }>();
const levels = new Map<number, number>();
let context: AudioContext | undefined;
async function remove(tabId: number): Promise<void> {
  const graph = graphs.get(tabId);
  if (!graph) return;
  graphs.delete(tabId); removeVolume(levels, tabId);
  graph.source.disconnect(); graph.gain.disconnect(); graph.stream.getTracks().forEach(t => t.stop());
  if (!graphs.size && context) { const old = context; context = undefined; await old.close(); }
}
async function handle(msg: { action: string; tabId: number; percent?: number; streamId?: string; origin?: string }): Promise<unknown> {
  if (msg.action === 'get') return { ok: true, percent: levels.get(msg.tabId) ?? 100, captured: graphs.has(msg.tabId), origin: graphs.get(msg.tabId)?.origin };
  if (msg.action === 'reset') { await remove(msg.tabId); return { ok: true, percent: 100 }; }
  if (msg.action !== 'set' || typeof msg.percent !== 'number') return { ok: false };
  let graph = graphs.get(msg.tabId);
  if (!graph) {
    if (!msg.streamId) return { ok: false };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } } as unknown as MediaTrackConstraints, video: false });
    try {
      context ??= new AudioContext();
      const source = context.createMediaStreamSource(stream); const gain = context.createGain();
      source.connect(gain); gain.connect(context.destination);
      graph = { stream, source, gain, origin: msg.origin ?? "" }; graphs.set(msg.tabId, graph);
      stream.getAudioTracks()[0]?.addEventListener('ended', () => { void remove(msg.tabId); }, { once: true });
      await context.resume();
    } catch (e) { stream.getTracks().forEach(t => t.stop()); await remove(msg.tabId); throw e; }
  }
  graph.gain.gain.value = percentToGain(msg.percent); setVolume(levels, msg.tabId, msg.percent);
  return { ok: true, percent: levels.get(msg.tabId) };
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.channel !== 'lifetools:volume-audio' || sender.id !== chrome.runtime.id || sender.tab) return false;
  void handle(msg).then(respond, () => respond({ ok: false })); return true;
});
