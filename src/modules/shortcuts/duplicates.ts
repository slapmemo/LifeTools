/** Manifest komut adı -> eylem kimliği (önerilen tuşu olmayan, kullanıcının atayabileceği komutlar). */
export const COMMAND_ACTIONS: Readonly<Record<string, string>> = {
  'action-link-copy': 'link.copyPage',
  'action-task-page': 'task.addPage',
  'action-session-save': 'session.save',
  'action-blocker-toggle': 'blocker.toggle',
  'action-group-site': 'group.bySite'
};

export interface CommandBinding { name?: string; shortcut?: string; description?: string }
export interface CommandRow { name: string; description: string; shortcut: string; assigned: boolean; duplicate: boolean }

/** Kısayol listesi satırları: atanmamışları ve LifeTools içinde çakışanları işaretler. */
export function describeCommands(commands: readonly CommandBinding[]): CommandRow[] {
  const dup = duplicateBindings(commands);
  return commands.filter(c => c.name).map(c => {
    const name = c.name as string;
    const shortcut = c.shortcut?.trim() ?? '';
    return { name, description: c.description || (name === '_execute_action' ? 'Eklenti simgesini aç' : name), shortcut, assigned: shortcut !== '', duplicate: dup.has(name) };
  });
}

/** Returns names of commands that share a nonempty binding. */
export function duplicateBindings(commands: readonly CommandBinding[]): Set<string> {
  const groups = new Map<string, string[]>();
  for (const command of commands) {
    const key = command.shortcut?.trim().toLowerCase();
    if (!key || !command.name) continue;
    groups.set(key, [...(groups.get(key) ?? []), command.name]);
  }
  return new Set([...groups.values()].filter(group => group.length > 1).flat());
}
