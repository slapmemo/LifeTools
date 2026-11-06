/** URL / kullanıcı adı işleme: tarayıcı API'lerinden bağımsız, test edilebilir. */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'
]);

// X'in özel sayfaları yanlışlıkla kullanıcı hesabı gibi engellenmesin.
export const RESERVED_ROUTES: ReadonlySet<string> = new Set([
  'home', 'explore', 'notifications', 'messages', 'i', 'settings',
  'compose', 'search', 'login', 'logout', 'signup', 'intent', 'share',
  'hashtag', 'bookmarks', 'lists', 'communities', 'community', 'premium',
  'verified', 'analytics', 'topics', 'connect', 'account', 'help',
  'privacy', 'tos', 'about', 'jobs', 'download', 'subscriptions',
  'followers', 'following', 'trending', 'display', 'safety',
  'communitynotes', 'notifications_timeline', 'oauth', 'auth', 'sessions'
]);

const HANDLE_RE = /^[a-zA-Z0-9_]{1,15}$/;
export const MAX_HANDLES = 500;

/**
 * @username, username, x.com/username veya tam X profil bağlantısını alır.
 * Geçersiz ya da X'e özel rota adları için null döner.
 */
export function normalizeHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let input = value.trim();
  if (!input) return null;

  if (/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\//i.test(input)) {
    try {
      if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
      const url = new URL(input);
      if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      input = url.pathname.split('/').filter(Boolean)[0] ?? '';
    } catch {
      return null;
    }
  } else if (input.startsWith('@')) {
    input = input.slice(1);
  }

  const handle = input.toLowerCase();
  if (!HANDLE_RE.test(handle) || RESERVED_ROUTES.has(handle)) return null;
  return handle;
}

/** Yalnızca X/Twitter'ın /kullaniciadi yolundaki gerçek profil adını çıkarır. */
export function extractProfileHandle(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const firstSegment = url.pathname.split('/')[1] ?? '';
    return normalizeHandle(firstSegment);
  } catch {
    return null;
  }
}

export function normalizeHandleList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  for (const candidate of value) {
    const handle = normalizeHandle(candidate);
    if (handle) unique.add(handle);
    if (unique.size >= MAX_HANDLES) break;
  }
  return [...unique];
}

export function isBlockedUrl(rawUrl: string, blockedHandles: readonly string[]): boolean {
  const handle = extractProfileHandle(rawUrl);
  return handle !== null && blockedHandles.includes(handle);
}
