import { translationTarget } from './bubble-logic';

export function parseTranslation(data: unknown): { text: string; source: string } | null {
  if (!Array.isArray(data) || !Array.isArray(data[0]) || !data[0].length || typeof data[2] !== 'string' || !data[2]) return null;
  if (!data[0].every((segment: unknown) => Array.isArray(segment) && typeof segment[0] === 'string')) return null;
  return { text: data[0].map((segment: string[]) => segment[0]).join(''), source: data[2] };
}

export function buildTranslationRequest(text: string, target: string): { url: string; init: RequestInit } {
  const params = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't' });
  const url = `https://translate.googleapis.com/translate_a/single?${params}`;
  if (text.length > 1800) return { url, init: { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ q: text }).toString(), credentials: 'omit' } };
  params.set('q', text);
  return { url: `https://translate.googleapis.com/translate_a/single?${params}`, init: { credentials: 'omit' } };
}

export async function translateText(text: string): Promise<{ ok: true; text: string; source: string; target: string } | { ok: false; error: 'network' | 'rate' | 'parse' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const request = async (target: string) => {
      const { url, init } = buildTranslationRequest(text, target);
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.status === 429 || response.status === 403) return { error: 'rate' as const };
      if (!response.ok) return { error: 'network' as const };
      try {
        const parsed = parseTranslation(await response.json());
        return parsed ? { parsed } : { error: 'parse' as const };
      } catch { return { error: controller.signal.aborted ? 'network' as const : 'parse' as const }; }
    };
    const first = await request('tr');
    if ('error' in first) return { ok: false, error: first.error! };
    const source = first.parsed!.source;
    const target = translationTarget(source);
    if (target === 'tr') return { ok: true, ...first.parsed!, target };
    const second = await request(target);
    if ('error' in second) return { ok: false, error: second.error! };
    return { ok: true, text: second.parsed!.text, source, target };
  } catch { return { ok: false, error: 'network' }; }
  finally { clearTimeout(timer); }
}
