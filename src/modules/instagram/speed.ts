export const SPEED_KEY = 'instagram.speed';
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export function formatSpeed(value: number): string {
  return `${String(value).replace('.', ',')}×`;
}

export function applyPlaybackSpeed(video: { playbackRate: number }, speed: number): void {
  if (video.playbackRate !== speed) video.playbackRate = speed;
}

/**
 * Sayfa hızı sürekli geri çekerse (ratechange ↔ yeniden yazma) sonsuz döngüye girmemek için:
 * `windowMs` içinde en fazla `limit` kez yeniden uygulamaya izin verir.
 */
export function createRateGuard(limit = 3, windowMs = 1000): (now: number) => boolean {
  let start = -Infinity; let count = 0;
  return now => {
    if (now - start > windowMs) { start = now; count = 0; }
    return ++count <= limit;
  };
}

export function parseSpeed(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && SPEEDS.some(speed => speed === value) ? value : 1;
}

export function nextSpeed(value: number, direction: 1 | -1): number {
  const index = SPEEDS.findIndex(speed => speed === parseSpeed(value));
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, index + direction))];
}
