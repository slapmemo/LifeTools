import { HOST_TRACKING_PARAMS, TRACKING_PARAMS } from './clean';

export const AUTO_CLEAN_KEY = 'linkCleanerAutoEnabled';
export const AUTO_CLEAN_ORIGINS = ['https://*/*', 'http://*/*'];
export const RULE_MIN = 9000;
export const RULE_MAX = 9099;

export function buildCleaningRules(params: readonly string[] = TRACKING_PARAMS): chrome.declarativeNetRequest.Rule[] {
  if (!params.length) return [];
  const globalRule: chrome.declarativeNetRequest.Rule = {
    id: RULE_MIN,
    priority: 1,
    action: { type: 'redirect' as chrome.declarativeNetRequest.RuleActionType, redirect: { transform: { queryTransform: { removeParams: [...params] } } } },
    condition: { regexFilter: '^[^?#]*\\?', resourceTypes: ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[] }
  };
  const scoped = (id: number, extra: readonly string[], condition: chrome.declarativeNetRequest.RuleCondition): chrome.declarativeNetRequest.Rule => ({
    id, priority: 2,
    action: { type: 'redirect' as chrome.declarativeNetRequest.RuleActionType, redirect: { transform: { queryTransform: { removeParams: [...params, ...extra] } } } },
    condition: { ...condition, resourceTypes: ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[] }
  });
  return [globalRule,
    scoped(9001, HOST_TRACKING_PARAMS.social, { regexFilter: '^[^?#]*\\?', requestDomains: ['x.com', 'twitter.com'] }),
    scoped(9002, HOST_TRACKING_PARAMS.media, { regexFilter: '^[^?#]*\\?', requestDomains: ['youtube.com', 'youtu.be', 'open.spotify.com'] }),
    scoped(9003, HOST_TRACKING_PARAMS.amazon, { regexFilter: '^https?://([^/?#]*\\.)?amazon\\.[^/?#]+[^?#]*\\?' })
  ];
}

export async function updateCleaningRules(enabled: boolean): Promise<void> {
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = current.filter(rule => rule.id >= RULE_MIN && rule.id <= RULE_MAX).map(rule => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: enabled ? buildCleaningRules() : [] });
}
