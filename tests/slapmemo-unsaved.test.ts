import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clearUnsaved, flushOrStash, readUnsaved, stashUnsaved } from '../src/modules/slapmemo/unsaved';

function fakeStore() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}

test('kaydedilemeyen düzenleme saklanır, kaydedilince silinir', async () => {
  const store = fakeStore();
  const failing = { flush: async () => false, getMarkdown: () => 'yarım kalan' };
  assert.equal(await flushOrStash(failing, 7, store), false);
  assert.equal(readUnsaved(store, 7)?.markdown, 'yarım kalan');
  const ok = { flush: async () => true, getMarkdown: () => 'tamam' };
  assert.equal(await flushOrStash(ok, 7, store), true);
  assert.equal(readUnsaved(store, 7), null);
});

test('flush hata fırlatırsa da metin saklanır ve false döner', async () => {
  const store = fakeStore();
  const throwing = { flush: async () => { throw new Error('x'); }, getMarkdown: () => 'metin' };
  assert.equal(await flushOrStash(throwing, 1, store), false);
  assert.equal(readUnsaved(store, 1)?.markdown, 'metin');
});

test('bozuk ya da erişilemeyen depo sorun çıkarmaz', () => {
  const store = fakeStore();
  store.setItem('lifetools_panel_note_unsaved_3', '{bozuk');
  assert.equal(readUnsaved(store, 3), null);
  const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(stashUnsaved(broken, 1, 'a'), false);
  assert.equal(readUnsaved(broken, 1), null);
  clearUnsaved(broken, 1);
});
