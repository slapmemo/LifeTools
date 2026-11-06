/** Turkish-insensitive search normalization shared by command-center ranking. */
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

export function parsePrefix(input: string): { id: 'note.add' | 'task.add'; arg: string } | null {
  const match = /^\s*(not|görev|gorev)\s+(.+?)\s*$/iu.exec(input);
  if (!match || !match[2].trim()) return null;
  return { id: foldSearch(match[1]) === 'not' ? 'note.add' : 'task.add', arg: match[2].trim() };
}
