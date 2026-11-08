import { describe, expect, test } from 'vitest';
import { settingsRestorePlan } from '../src/core/backup-settings';

describe('settingsRestorePlan', () => {
  const keys = ['ui_theme', 'enabled'];

  test('keeps existing settings when no known keys are present', () => {
    expect(settingsRestorePlan({}, keys)).toEqual({ remove: [], set: {} });
    expect(settingsRestorePlan({ unknown: true }, keys)).toEqual({ remove: [], set: {} });
  });

  test('replaces known settings when the backup contains any', () => {
    expect(settingsRestorePlan({ ui_theme: 'dark', unknown: true }, keys)).toEqual({
      remove: keys,
      set: { ui_theme: 'dark' }
    });
  });
});
