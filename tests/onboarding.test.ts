import { describe, expect, it } from 'vitest';
import { RECOMMENDED_MODULES, recommendedFlags } from '../src/core/onboarding';
import { modules } from '../src/modules';

// Kaynak gerçek modül kaydı; yeni modül eklenince liste kendiliğinden güncellenir.
const ids = modules.map(m => m.id);

describe('onboarding recommendations', () => {
  it('enables recommended modules and disables other and unknown ids', () => {
    const flags = recommendedFlags([...ids, 'unknown']);
    for (const id of RECOMMENDED_MODULES) expect(flags[id]).toBe(true);
    for (const id of ids.filter(id => !RECOMMENDED_MODULES.includes(id))) expect(flags[id]).toBe(false);
    expect(flags.unknown).toBe(false);
  });

  it('only recommends registered module ids', () => {
    for (const id of RECOMMENDED_MODULES) expect(ids).toContain(id);
  });
});
