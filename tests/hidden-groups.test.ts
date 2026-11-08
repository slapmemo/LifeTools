import { describe, expect, it } from 'vitest';
import { HIDDEN_PREFIX, hiddenGroupModel } from '../src/modules/tab-manager/logic';
import type { Session, SessionTab } from '../src/modules/life-browser/repo';

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
