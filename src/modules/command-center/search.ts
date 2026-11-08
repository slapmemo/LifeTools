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

export function parsePrefix(input: string): { id: string; arg: string } | null {
  const trimmed = input.trim();
  const words = trimmed.split(/\s+/);
  const first = foldSearch(words[0] || '');
  const second = foldSearch(words[1] || '');
  const args: Record<string, string> = { not: 'note.add', gorev: 'task.add', izle: 'watch.add' };
  if (args[first]) return words.length > 1 ? { id: args[first], arg: trimmed.slice(words[0].length).trim() } : null;
  if (first === 'oturum' && second === 'kaydet') return { id: 'session.save', arg: words.slice(2).join(' ') };
  if (first === 'temiz' && second === 'link' && words.length === 2) return { id: 'link.copyPage', arg: '' };
  const commands: Record<string, string> = { grupla: 'group.bySite', kopyalar: 'duplicates.show', zombiler: 'zombie.show', yuva: 'slots.show', sure: 'time.today' };
  return words.length === 1 && commands[first] ? { id: commands[first], arg: '' } : null;
}

/** Son tarih ve saat yalnızca başlığın sonundaki geçerli ifadelerden ayrılır. */
export function parseTurkishDue(text: string, now: Date): { title: string; due: string | null } {
  let title = text.trim();
  const timeMatch = /(?:^|\s)(\d{1,2}):(\d{2})$/.exec(title);
  let time = '';
  if (timeMatch && Number(timeMatch[1]) < 24 && Number(timeMatch[2]) < 60) {
    time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    title = title.slice(0, timeMatch.index).trim();
  }
  const match = /(?:^|\s)([^\s]+)$/.exec(title);
  const token = match ? foldSearch(match[1]) : '';
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
  let found = true;
  if (token === 'yarin') date.setDate(date.getDate() + 1);
  else if (token === 'bugun') { /* today */ }
  else if (days.includes(token)) date.setDate(date.getDate() + ((days.indexOf(token) - date.getDay() + 7) % 7 || 7));
  else if (/^\d{1,2}\.\d{1,2}$/.test(token)) {
    const [day, month] = token.split('.').map(Number);
    date.setFullYear(now.getFullYear(), month - 1, day);
    if (date.getMonth() !== month - 1 || date.getDate() !== day) { found = false; date.setFullYear(now.getFullYear(), now.getMonth(), now.getDate()); }
    else if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date.setFullYear(date.getFullYear() + 1);
  } else found = false;
  if (found && match && title.slice(0, match.index).trim()) title = title.slice(0, match.index).trim();
  else if (!time || !title) return { title: text.trim(), due: null };
  if (!found && !time) return { title: text.trim(), due: null };
  const due = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { title, due: due + (time ? ` ${time}` : '') };
}
