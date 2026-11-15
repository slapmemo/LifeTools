import { describe, expect, it } from 'vitest';
import { buildTabMenuModel } from '../src/modules/tab-manager/menu-logic';
import { HIDDEN_PREFIX } from '../src/modules/life-browser/repo';

describe('sekme menüsü', () => {
  it('yalnızca pencerenin gruplarını, geçerli grup işaretini ve en yeni 15 gizli kaydı sunar', () => {
    const groups = [{ id: 1, title: '', windowId: 4 }, { id: 2, title: 'İş', windowId: 5 }];
    const sessions = Array.from({ length: 17 }, (_, id) => ({ id, name: HIDDEN_PREFIX + `Grup ${id}`, created_at: id, tab_count: 1 }));
    sessions.push({ id: 99, name: 'Normal oturum', created_at: 99, tab_count: 1 });
    const model = buildTabMenuModel(groups, sessions, { windowId: 4, groupId: 1, url: 'https://www.örnek.com/' }, 'chrome-extension://abc/');
    expect(model.groups).toEqual([{ id: 1, title: 'Adsız grup', current: true }]);
    expect(model.sessions).toHaveLength(15);
    expect(model.sessions[0]).toEqual({ id: 16, title: 'Grup 16' });
    expect(model.grouped).toBe(true);
    expect(model.site).toBe('xn--rnek-4qa.com');
  });
  it('dahili ve geçersiz adreslerde kayıt hedeflerini gizler', () => {
    const sessions = [{ id: 1, name: HIDDEN_PREFIX + 'İş', created_at: 1, tab_count: 1 }];
    for (const url of ['chrome://settings', 'chrome-extension://abc/tabs.html', '']) {
      const model = buildTabMenuModel([], sessions, { windowId: 1, groupId: -1, url }, 'chrome-extension://abc/');
      expect(model.sessions).toEqual([]);
      expect(model.grouped).toBe(false);
    }
  });
});
