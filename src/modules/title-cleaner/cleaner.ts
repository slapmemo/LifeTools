export const TITLE_RULES_KEY = 'titleCleanerRules';
export type TitleRules = Record<string, string[]>;
export function cleanTitle(title: string, url: string, rules: TitleRules = {}): string {
  let host = ''; try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* adres olmayabilir */ }
  let text = title.replace(/^\s*(?:\(\d+\)\s*)+/, '');
  for (const rule of rules[host] ?? []) if (rule) text = text.split(rule).join('');
  const match = text.match(/\s+[-|/–—]\s+([^|/–—]+)\s*$/);
  if (match) {
    const suffix = match[1].trim().toLowerCase();
    const site = host.split('.')[0];
    if (suffix === site || (site === 'youtube' && suffix === 'youtube') || ((site === 'x' || site === 'twitter') && (suffix === 'x' || suffix === 'twitter')) || (site === 'google' && (suffix === 'google search' || suffix === 'google arama'))) text = text.slice(0, match.index);
  }
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 80 ? text.slice(0, 79).trimEnd() + '…' : text;
}
