import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupSettingKeys, EXTRA_SETTING_KEYS } from '../src/core/backup-settings';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('backup setting keys', () => {
  const all = sources(join(__dirname, '..', 'src')).join('\n');
  it('every extra key is an exported *_KEY constant somewhere in src', () => {
    for (const key of EXTRA_SETTING_KEYS) expect(all, key).toMatch(new RegExp(`export const [A-Z_]*KEY[A-Z_]* = '${key.replace('.', '\.')}'`));
  });
  it('has no duplicates', () => {
    const keys = backupSettingKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
