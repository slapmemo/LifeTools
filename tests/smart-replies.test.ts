import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from '../src/db/migrations';
import { createSnippetsRepo, validateTrigger } from '../src/modules/smart-replies/repo';
import { findTriggerAtCaret } from '../src/modules/smart-replies/trigger';
import { createMemoryExecutor } from './sqlite-memory';
test('trigger validation', () => {
  assert.equal(validateTrigger('/ABC'), '/abc'); assert.equal(validateTrigger(';ADRESIM'), ';adresim'); assert.equal(validateTrigger('/LIST'), '/list');
  for (const value of ['abc', '/', '/a b', '/'+ 'a'.repeat(32)]) assert.throws(() => validateTrigger(value));
});
test('finds longest trigger at word boundary', () => {
  const triggers = ['/r', '/refund', ';adresim', '/list'];
  assert.equal(findTriggerAtCaret('hello /refund', triggers), '/refund');
  assert.equal(findTriggerAtCaret('abc/refund', triggers), null);
  assert.equal(findTriggerAtCaret('hello ;ADRESIM', triggers), ';adresim');
  assert.equal(findTriggerAtCaret('hello /LIST', triggers), '/list');
});
test('snippet CRUD, search, uniqueness and use count', async () => {
  const ex = await createMemoryExecutor(); await runMigrations(ex); const repo = createSnippetsRepo(ex, () => 100);
  const row = await repo.add({trigger: '/REFUND', title: 'Payment', body: 'Hello world'});
  assert.equal(row.trigger, '/refund'); assert.equal((await repo.getByTrigger('/REFUND'))?.id, row.id);
  await assert.rejects(() => repo.add({trigger:'/refund', title:'x', body:'y'}), /zaten/);
  assert.equal((await repo.list('world')).length, 1); assert.equal((await repo.list('Payment')).length, 1);
  await repo.incrementUse(row.id); assert.equal((await repo.list())[0].use_count, 1);
  await repo.update(row.id, {trigger:';a', title:'Updated', body:'New'}); assert.equal((await repo.getByTrigger(';a'))?.body, 'New');
  await repo.delete(row.id); assert.equal((await repo.list()).length, 0);
});
