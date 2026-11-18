/** Turkish-insensitive search normalization shared by popup search ranking. */
export function foldSearch(value: string): string {
  return value.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
}

export interface SearchableAction { title: string; keywords: readonly string[] }
export function rankActions<T extends SearchableAction>(actions: readonly T[], query: string): T[] {
  const q = foldSearch(query.trim());
  if (!q) return [...actions];
  const score = (action: T): number => {
    const fields = [action.title, ...action.keywords].map(foldSearch);
    if (fields.some(field => field.startsWith(q))) return 0;
    if (fields.some(field => field.split(/\s+/).some(word => word.startsWith(q)))) return 1;
    if (fields.some(field => field.includes(q))) return 2;
    let i = 0;
    for (const char of fields.join(' ')) if (char === q[i]) i++;
    return i === q.length ? 3 : Infinity;
  };
  return actions.map((action, index) => ({ action, index, score: score(action) }))
    .filter(item => Number.isFinite(item.score)).sort((a, b) => a.score - b.score || a.index - b.index)
    .map(item => item.action);
}

/** Argüman alan komutlar ("not metin", "izle başlık"). Her eylem `builtin-actions.ts`'te kayıtlı olmalı (test denetler). */
export const PREFIX_ARG_COMMANDS: Record<string, string> = { not: 'note.add', izle: 'watch.add' };
/** Tek sözcüklük komutlar. */
export const PREFIX_COMMANDS: Record<string, string> = { grupla: 'group.bySite', kopyalar: 'duplicates.show', zombiler: 'zombie.show', sure: 'time.today' };

export function parsePrefix(input: string): { id: string; arg: string } | null {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  const first = foldSearch(words[0] || '');
  const second = foldSearch(words[1] || '');
  const args: Record<string, string> = PREFIX_ARG_COMMANDS;
  if (args[first]) return words.length > 1 ? { id: args[first], arg: trimmed.slice(words[0].length).trim() } : null;
  if ((first === 'oturum' || first === 'grup') && second === 'kaydet') return { id: 'session.save', arg: words.slice(2).join(' ') };
  if (first === 'temiz' && second === 'link' && words.length === 2) return { id: 'link.copyPage', arg: '' };
  const commands: Record<string, string> = PREFIX_COMMANDS;
  return words.length === 1 && commands[first] ? { id: commands[first], arg: '' } : null;
}
