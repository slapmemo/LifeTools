import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseOrigin } from '../src/core/site-scripts';

function mockChrome(stored: Record<string, unknown>) {
  const remove = vi.fn(async () => true);
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => stored) } }, permissions: { remove } });
  return remove;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('releaseOrigin', () => {
  it('keeps permissions another module still needs', async () => {
    const remove = mockChrome({ smartReplySites: [], siteToolbarSites: [{ origin: 'https://a.test/*', actions: [] }] });
    await releaseOrigin('https://a.test/*');
    await releaseOrigin('https://www.youtube.com/*');
    await releaseOrigin('https://store.steampowered.com/*');
    expect(remove).not.toHaveBeenCalled();
  });
  it('revokes an origin nobody uses', async () => {
    const remove = mockChrome({ smartReplySites: [], siteToolbarSites: [] });
    await releaseOrigin('https://b.test/*');
    expect(remove).toHaveBeenCalledWith({ origins: ['https://b.test/*'] });
  });
});
