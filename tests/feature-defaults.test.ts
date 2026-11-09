import { describe, expect, it, vi } from 'vitest';
import { CHANNEL_IDS, defaultConfig, parseConfig } from '../desktop/src/ambient';
import { defaults as videoDefaults } from '../src/modules/x-video/shared';

describe('feature defaults', () => {
  it('enables video options', () => {
    expect(videoDefaults.oneClick).toBe(true);
    expect(videoDefaults.saveAs).toBe(true);
  });
  it('enables ambient channels while preserving explicit off settings', async () => {
    vi.stubGlobal('window', { addEventListener: vi.fn() });
    const { CHANNEL_IDS, defaultConfig, parseConfig } = await import('../desktop/src/ambient');
    vi.unstubAllGlobals();
    expect(CHANNEL_IDS.every(id => defaultConfig().channels[id].on)).toBe(true);
    const config = parseConfig(JSON.stringify({ channels: { rain: { on: false }, fan: { vol: 0.2 } } }));
    expect(config.channels.rain.on).toBe(false);
    expect(config.channels.fan.on).toBe(true);
  });
});
