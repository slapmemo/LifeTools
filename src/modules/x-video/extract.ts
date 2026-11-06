export interface Variant { url: string; bitrate?: number; contentType: string }
export interface VideoMedia { tweetId: string; screenName: string; mediaKey: string; variants: Variant[]; durationMs?: number; thumb?: string }
export function extractVideoMedia(json: unknown): VideoMedia[] {
  const result: VideoMedia[] = []; const seen = new Set<object>();
  function walk(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); const o = value as Record<string, any>;
    const legacy = o.legacy;
    if (legacy && typeof legacy === 'object' && (o.rest_id || legacy.id_str)) {
      const tweetId = String(o.rest_id ?? legacy.id_str);
      const screenName = String(o.core?.user_results?.result?.legacy?.screen_name ?? legacy.user?.screen_name ?? 'x');
      const media = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
      if (Array.isArray(media)) for (const m of media) {
        if (!Array.isArray(m?.video_info?.variants)) continue;
        const variants: Variant[] = m.video_info.variants.filter((v: any) => v?.content_type === 'video/mp4' && typeof v.url === 'string').map((v: any) => ({url:v.url, bitrate:typeof v.bitrate === 'number' ? v.bitrate : undefined, contentType:v.content_type}));
        result.push({tweetId, screenName, mediaKey:String(m.media_key ?? m.id_str ?? ''), variants, durationMs:m.video_info.duration_millis, thumb:m.media_url_https});
      }
    }
    for (const child of Object.values(o)) walk(child);
  }
  walk(json); return result;
}
