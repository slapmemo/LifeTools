import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHandle, normalizeHandleList, extractProfileHandle, isBlockedUrl } from '../shared/rules.mjs';

test('normal kullanıcı adları ve bağlantılar kabul edilir', () => {
  for (const input of ['@OrNeK_1', 'ornek_1', 'https://x.com/Ornek_1', 'www.twitter.com/Ornek_1/status/123']) {
    assert.equal(normalizeHandle(input), 'ornek_1');
  }
});

test('geçersiz kullanıcı adları ve özel X sayfaları reddedilir', () => {
  for (const input of ['', '@', '@foo.bar', 'x.com', 'https://evil.com/foo', 'https://x.com@evil.com/user', 'x.com/i/status/123', 'home', 'messages', 'a'.repeat(16), '../test']) {
    assert.equal(normalizeHandle(input), null, input);
  }
});

test('profil alt sayfaları kapsanır, benzer isimler kapsanmaz', () => {
  const blocked = ['ornek'];
  for (const url of [
    'https://x.com/ornek', 'https://x.com/OrNeK/status/132',
    'https://twitter.com/ornek/media', 'https://www.x.com/ornek/with_replies'
  ]) assert.equal(isBlockedUrl(url, blocked), true, url);
  for (const url of [
    'https://x.com/ornek2', 'https://x.com/home',
    'https://x.com/i/status/123', 'https://evil.com/ornek',
    'https://x.com.evil.com/ornek', 'https://x.com/search?q=ornek'
  ]) assert.equal(isBlockedUrl(url, blocked), false, url);
});

test('URL kökünü çözer', () => {
  assert.equal(extractProfileHandle('https://x.com/ABC?lang=tr'), 'abc');
  assert.equal(extractProfileHandle('https://x.com/settings/account'), null);
  assert.equal(extractProfileHandle('invalid'), null);
});

test('listeyi normalize eder, tekrarları temizler', () => {
  assert.deepEqual(normalizeHandleList(['@Foo', 'foo', 'BAR', null, 'home']), ['foo', 'bar']);
});
