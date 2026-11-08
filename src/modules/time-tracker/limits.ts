export const LIMITS_KEY = 'timeTrackerLimits';
export const LIMITS_ENABLED_KEY = 'timeTrackerLimitsEnabled';
export const NOTIFIED_KEY = 'timeTrackerLimitNotified';
export type DailyLimits = Record<string, number>;

export function crossedThresholds(prevSeconds: number, nextSeconds: number, limitMinutes: number): ('80' | '100')[] {
  if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) return [];
  const limit = limitMinutes * 60;
  const result: ('80' | '100')[] = [];
  if (prevSeconds < limit * 0.8 && nextSeconds >= limit * 0.8) result.push('80');
  if (prevSeconds < limit && nextSeconds >= limit) result.push('100');
  return result;
}
