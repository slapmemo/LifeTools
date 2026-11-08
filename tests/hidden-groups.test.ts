import { describe, expect, it } from 'vitest';
import { HIDDEN_PREFIX, hiddenGroupCollapsed, hiddenGroupModel, hiddenTabModel } from '../src/modules/tab-manager/logic';
import { createSessionsRepo, type Session, type SessionTab } from '../src/modules/life-browser/repo';
import { runMigrations } from '../src/db/migrations';
import { createMemoryExecutor } from './sqlite-memory';

const session: Session = { id: 1, name: HIDDEN_PREFIX + 'Sonra', created_at: 1, tab_count: 2 };
const tab: SessionTab = { id: 1, session_id: 1, position: 0, url: 'https://example.com', title: null, pinned: 0, group_title: 'Sonra', group_color: 'blue' };
describe('hiddenGroupModel', () => {
  it('builds a chip only for marked single-group sessions', () => {
    expect(hiddenGroupModel(session, [tab, { ...tab, id: 2 }])).toEqual({ id: 1, name: 'Sonra', color: 'blue', count: 2 });
    expect(hiddenGroupModel({ ...session, name: 'Sonra' }, [tab])).toBeUndefined();
    expect(hiddenGroupModel(session, [])).toBeUndefined();
    expect(hiddenGroupModel(session, [{ ...tab, group_title: null }])).toBeUndefined();
    expect(hiddenGroupModel(session, [tab, { ...tab, group_title: 'Başka' }])).toBeUndefined();
  });
});

describe('hidden group card logic', () => {
  it('provides a title and hostname with fallbacks', () => {
    expect(hiddenTabModel(tab)).toEqual({ title: tab.url, host: 'example.com' });
    expect(hiddenTabModel({ title: 'Başlık', url: 'not a url' })).toEqual({ title: 'Başlık', host: 'not a url' });
  });
  it('uses the saved collapse state or the group count default', () => {
    expect(hiddenGroupCollapsed(null, 3)).toBe(false);
    expect(hiddenGroupCollapsed(null, 4)).toBe(true);
    expect(hiddenGroupCollapsed('false', 4)).toBe(false);
    expect(hiddenGroupCollapsed('true', 1)).toBe(true);
  });
  it('removes only the chosen hidden tab and deletes the empty group', async () => {
    const ex = await createMemoryExecutor(); await runMigrations(ex);
    const repo = createSessionsRepo(ex);
    const input = { url: tab.url, title: null, pinned: false, group_title: 'Sonra', group_color: 'blue' };
    const id = await repo.save(HIDDEN_PREFIX + 'Sonra', [input, input]);
    const ordinary = await repo.save('Diğer', [input]);
    const [first, second] = await repo.tabs(id);
    await repo.removeHiddenTab(id, first.id);
    expect(await repo.tabs(id)).toHaveLength(1);
    await repo.removeHiddenTab(ordinary, (await repo.tabs(ordinary))[0].id);
    expect(await repo.tabs(ordinary)).toHaveLength(1);
    await repo.removeHiddenTab(id, second.id);
    expect((await repo.list()).map(item => item.id)).toEqual([ordinary]);
  });
});
