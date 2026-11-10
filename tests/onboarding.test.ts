import { describe, expect, it } from 'vitest';
import { RECOMMENDED_MODULES, recommendedFlags } from '../src/core/onboarding';

const ids = ['clip-slots', 'command-center', 'instagram', 'life-browser', 'link-cleaner', 'pinned-guard', 'pip', 'quick-tasks', 'shortcuts', 'site-blocker', 'site-toolbar', 'slapmemo', 'smart-replies', 'tab-labels', 'tab-manager', 'tab-notes', 'tab-switcher', 'time-tracker', 'title-cleaner', 'video-downloader', 'volume-booster', 'watchlist', 'x-video', 'zombie-tabs'];

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
