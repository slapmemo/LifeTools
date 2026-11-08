export const LABEL_EMOJI: Record<string, string> = { 'Önemli': '⭐ ', 'Sonra Bak': '🕒 ', 'Araştırma': '🔎 ' };
export function labelTitle(title: string, label: string): string {
  const prefixes = Object.values(LABEL_EMOJI);
  let clean = title;
  while (prefixes.some(prefix => clean.startsWith(prefix))) clean = clean.slice(prefixes.find(prefix => clean.startsWith(prefix))!.length);
  return (LABEL_EMOJI[label] ?? '') + clean;
}
