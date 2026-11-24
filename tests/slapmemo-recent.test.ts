import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createRecentStore, UNDO_WINDOW_MS, type SessionLike } from '../src/modules/slapmemo/recent-notes';

function fakeSession(): SessionLike {
  const data: Record<string, unknown> = {};
  return { get: async key => ({ [key]: data[key] }), set: async items => { Object.assign(data, items); } };
}

test('service worker yeniden başlasa da son kayıt geri alınabilir', async () => {
  const session = fakeSession();
  await createRecentStore(session).remember(25, 1_000);
  const restarted = createRecentStore(session); // boş bellekli yeni örnek
  assert.equal(await restarted.isRecent(25, 3_000), true);
  assert.equal(await restarted.isRecent(26, 3_000), false);
});

test('süre dolunca ve silinince geri alma reddedilir', async () => {
  const store = createRecentStore(fakeSession());
  await store.remember(1, 0);
  assert.equal(await store.isRecent(1, UNDO_WINDOW_MS + 1), false);
  await store.remember(2, 0);
  await store.forget(2, 10);
  assert.equal(await store.isRecent(2, 20), false);
  assert.equal(await store.isRecent('x', 20), false);
});
