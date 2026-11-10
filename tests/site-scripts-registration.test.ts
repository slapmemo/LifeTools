import { describe, expect, it } from 'vitest';
import { sameRegistration } from '../src/core/site-scripts';

describe('sameRegistration', () => {
  const desired = { matches: ['https://a.com/*', 'https://b.com/*'], js: ['x.js'], allFrames: false, world: 'ISOLATED' };
  it('sırayı yok sayar ve varsayılanları eşler', () => {
    expect(sameRegistration({ matches: ['https://b.com/*', 'https://a.com/*'], js: ['x.js'] }, desired)).toBe(true);
  });
  it('farklı eşleşme, dosya, allFrames veya world için false', () => {
    expect(sameRegistration({ ...desired, matches: ['https://a.com/*'] }, desired)).toBe(false);
    expect(sameRegistration({ ...desired, js: ['y.js'] }, desired)).toBe(false);
    expect(sameRegistration({ ...desired, allFrames: true }, desired)).toBe(false);
    expect(sameRegistration({ ...desired, world: 'MAIN' }, desired)).toBe(false);
  });
});
