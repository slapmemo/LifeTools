export const PIP_HOVER_ENABLED_KEY = 'pip_hover_enabled';
export const PIP_HOVER_ORIGINS = ['https://*/*', 'http://*/*'];

export function pipButtonPosition(rect: { left: number; right: number; top: number }, hostname: string): { left: number; top: number } {
  const host = hostname.toLowerCase();
  const isX = host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
  return { left: isX ? rect.left + 8 : rect.right - 40, top: rect.top + 8 };
}
