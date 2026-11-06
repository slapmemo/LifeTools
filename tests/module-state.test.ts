import assert from 'node:assert/strict';
import { test } from 'vitest';
import { resolveEnabled } from '../src/core/module-state';

test('kayıt yoksa modül açıktır', () => {
  assert.equal(resolveEnabled(undefined, 'site-blocker'), true);
  assert.equal(resolveEnabled({}, 'site-blocker'), true);
  assert.equal(resolveEnabled('bozuk', 'site-blocker'), true);
});

test('yalnızca açık false modülü kapatır', () => {
  assert.equal(resolveEnabled({ 'site-blocker': false }, 'site-blocker'), false);
  assert.equal(resolveEnabled({ 'site-blocker': true }, 'site-blocker'), true);
  assert.equal(resolveEnabled({ other: false }, 'site-blocker'), true);
});
