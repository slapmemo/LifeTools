export const SPEED_KEY = 'instagram.speed';
export const SPEEDS = [0.5, 1, 1.25, 1.5, 2, 3] as const;

export function parseSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && SPEEDS.some(speed => speed === value) ? value : 1;
}

export function nextSpeed(value: number, direction: 1 | -1): number {
  const index = SPEEDS.findIndex(speed => speed === parseSpeed(value));
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
}
