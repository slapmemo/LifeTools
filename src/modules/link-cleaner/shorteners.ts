const HOSTS = ['bit.ly', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'buff.ly', 'is.gd', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 't.ly', 'lnkd.in', 'amzn.to', 's.id', 'tiny.cc'] as const;

export const SHORTENER_ORIGINS = HOSTS.map(host => `https://${host}/*`);
export const SHORT_LINK_PERMISSION_ORIGINS = ['https://*/*', 'http://*/*'];
export const SHORT_LINK_KEY = 'linkCleanerExpandShortLinks';

export function isShortLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (HOSTS as readonly string[]).includes(parsed.hostname);
  } catch { return false; }
}
