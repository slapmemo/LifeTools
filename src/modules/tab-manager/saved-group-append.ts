import type { SessionsRepo } from '../life-browser/repo';
import type { SessionTabInput } from '../life-browser/tabs';

export async function appendToSavedGroup(repo: SessionsRepo, sessionId: number, tabs: readonly SessionTabInput[]): Promise<void> {
  const first = (await repo.tabs(sessionId))[0];
  await repo.appendTabs(sessionId, tabs.map(tab => ({
    ...tab,
    group_title: first ? first.group_title : 'Sonra',
    group_color: first ? first.group_color : 'orange',
    note: null
  })));
}
