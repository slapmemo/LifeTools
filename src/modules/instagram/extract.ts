export interface InstagramVideo { code: string; pk: string; username: string; url: string; index?: number; count: number }
export function extractMedia(json: unknown): InstagramVideo[] {
  const result: InstagramVideo[] = []; const seen = new Set<object>();
  function walk(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); const o = value as Record<string, any>;
    const code = String(o.code ?? o.shortcode ?? o.pk ?? o.id ?? '');
    const username = String(o.user?.username ?? o.owner?.username ?? 'instagram');
    const children = Array.isArray(o.carousel_media) ? o.carousel_media : null;
    const items = children ?? [o];
    const videos = items.flatMap((item: any, index: number) => {
      if (!Array.isArray(item?.video_versions)) return [];
      const best = item.video_versions.filter((v: any) => typeof v?.url === 'string').sort((a: any, b: any) => (Number(b.width) || 0) * (Number(b.height) || 0) - (Number(a.width) || 0) * (Number(a.height) || 0))[0];
      return best && code ? [{ code, pk: String(item.pk ?? item.id ?? o.pk ?? o.id ?? ''), username, url: best.url, index: children ? index + 1 : undefined, count: 0 }] : [];
    });
    for (const video of videos) { video.count = videos.length; result.push(video); }
    for (const [key, child] of Object.entries(o)) if (key !== 'carousel_media') walk(child);
  }
  walk(json); return result;
}
