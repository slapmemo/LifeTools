const BADGE_MS = 2000;
let badgeTimer: ReturnType<typeof setTimeout> | undefined;

export type BadgeIcon = '✓' | '=' | '!';

export function flashBadge(text: BadgeIcon): void {
  const color = text === '✓' ? '#43c89c' : text === '=' ? '#d4a16b' : '#e05a5f';
  void chrome.action.setBadgeBackgroundColor({ color });
  void chrome.action.setBadgeText({ text });
  if (badgeTimer) clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    void chrome.action.setBadgeText({ text: '' });
  }, BADGE_MS);
}
