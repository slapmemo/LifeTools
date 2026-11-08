import { describe, expect, it } from 'vitest';
import { pipButtonPosition } from '../src/modules/pip/hover-logic';

describe('pipButtonPosition', () => {
  const rect = { left: 20, right: 420, top: 30 };
  it('places the button at the top right on ordinary sites', () => {
    expect(pipButtonPosition(rect, 'example.com')).toEqual({ left: 380, top: 38 });
  });
  it('uses the top left on X and Twitter domains', () => {
    for (const host of ['x.com', 'www.x.com', 'twitter.com', 'mobile.twitter.com'])
      expect(pipButtonPosition(rect, host)).toEqual({ left: 28, top: 38 });
    expect(pipButtonPosition(rect, 'notx.com')).toEqual({ left: 380, top: 38 });
  });
});
