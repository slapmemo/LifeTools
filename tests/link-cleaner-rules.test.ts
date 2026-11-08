import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRACKING_PARAMS } from '../src/modules/link-cleaner/clean';
import { buildCleaningRules, updateCleaningRules } from '../src/modules/link-cleaner/rules';

describe('automatic link cleaning rules', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('builds a query redirect for the exact global parameters', () => {
    const [rule] = buildCleaningRules();
    expect(rule.id).toBe(9000);
    expect(rule.condition).toEqual({ regexFilter: '^[^?#]*\\?', resourceTypes: ['main_frame', 'sub_frame'] });
    expect(rule.action.redirect?.transform?.queryTransform?.removeParams).toEqual(TRACKING_PARAMS);
    expect(TRACKING_PARAMS).toContain('utm_name');
    expect(TRACKING_PARAMS).not.toContain('si');
    const rules = buildCleaningRules();
    expect(rules[1].condition.requestDomains).toEqual(['x.com', 'twitter.com']);
    expect(rules[1].action.redirect?.transform?.queryTransform?.removeParams).toContain('s');
    expect(rules[2].action.redirect?.transform?.queryTransform?.removeParams).toContain('si');
    expect(rules[3].action.redirect?.transform?.queryTransform?.removeParams).toContain('ref');
    expect(buildCleaningRules([])).toEqual([]);
  });
  it('removes only reserved rules when disabled', async () => {
    const updateDynamicRules = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { declarativeNetRequest: { getDynamicRules: vi.fn().mockResolvedValue([{ id: 1 }, { id: 9000 }, { id: 9099 }, { id: 9100 }]), updateDynamicRules } });
    await updateCleaningRules(false);
    expect(updateDynamicRules).toHaveBeenCalledWith({ removeRuleIds: [9000, 9099], addRules: [] });
  });
});
