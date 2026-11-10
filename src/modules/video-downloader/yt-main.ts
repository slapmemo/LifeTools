interface PlayerResponse {
  videoDetails?: { videoId?: string; lengthSeconds?: string; title?: string };
  streamingData?: { adaptiveFormats?: PlayerStream[]; formats?: PlayerStream[] };
}
interface PlayerStream {
  itag?: number; mimeType?: string; height?: number; fps?: number; bitrate?: number;
  contentLength?: string | number; approxDurationMs?: string | number;
}

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'lifetools-yt' || event.data?.type !== 'player-request' || typeof event.data.id !== 'string' || typeof event.data.videoId !== 'string') return;
  const { id, videoId } = event.data as { id: string; videoId: string };
  const player = document.querySelector('#movie_player') as (Element & { getPlayerResponse?: () => PlayerResponse | undefined }) | null;
  const initial = (window as Window & { ytInitialPlayerResponse?: PlayerResponse }).ytInitialPlayerResponse;
  let response = player?.getPlayerResponse?.();
  if (response?.videoDetails?.videoId !== videoId) response = initial?.videoDetails?.videoId === videoId ? initial : undefined;
  if (!response) return;
  const details = response.videoDetails;
  if (!details || details.videoId !== videoId) return;
  const seconds = Number(details.lengthSeconds);
  const streams = [...(response.streamingData?.adaptiveFormats ?? []), ...(response.streamingData?.formats ?? [])];
  const formats = streams.map(({ itag, mimeType, height, fps, bitrate, contentLength, approxDurationMs }) => ({ itag, mimeType, height, fps, bitrate, contentLength, approxDurationMs }));
  window.postMessage({ source: 'lifetools-yt', type: 'player-response', id, videoId, duration: Number.isFinite(seconds) && seconds > 0 ? seconds : null, title: details.title ?? null, formats }, location.origin);
});
