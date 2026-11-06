const GLOBAL_TRACKING_EXACT = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'igsh',
  'yclid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'ref_src',
  'ref_url',
  'twclid',
  'ttclid',
  'spm',
  'vero_id',
  'oly_enc_id',
  'oly_anon_id',
  '_openstat'
]);

function isTrackingParam(nameLower: string, hostname: string): boolean {
  if (nameLower.startsWith('utm_')) {
    return true;
  }
  if (GLOBAL_TRACKING_EXACT.has(nameLower)) {
    return true;
  }

  // Host-specific rules
  const host = hostname.toLowerCase();

  // x.com / twitter.com -> s, t
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    if (nameLower === 's' || nameLower === 't') {
      return true;
    }
  }

  // youtube.com / youtu.be / open.spotify.com -> si
  if (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host === 'open.spotify.com'
  ) {
    if (nameLower === 'si') {
      return true;
    }
  }

  // amazon.* -> ref, ref_, pf_rd_*, pd_rd_* (psc is KEPT)
  const isAmazon = host === 'amazon' || host.startsWith('amazon.') || host.includes('.amazon.');
  if (isAmazon) {
    if (nameLower === 'psc') {
      return false;
    }
    if (
      nameLower === 'ref' ||
      nameLower === 'ref_' ||
      nameLower.startsWith('pf_rd_') ||
      nameLower.startsWith('pd_rd_')
    ) {
      return true;
    }
  }

  return false;
}

export function cleanUrl(raw: string): { url: string; removed: string[] } | null {
  if (!raw || typeof raw !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const removed: string[] = [];
  // URLSearchParams yalnızca adları çözümlemek için kullanılır; kalan parçalar
  // yeniden kodlanmadan ve sıraları değiştirilmeden korunur.
  const query = parsed.search.slice(1);
  const keep = query ? query.split('&').filter(part => {
    const key = new URLSearchParams(part).keys().next().value ?? '';
    if (!isTrackingParam(key.toLowerCase(), parsed.hostname)) return true;
    removed.push(key);
    return false;
  }) : [];
  parsed.search = keep.length ? `?${keep.join('&')}` : '';
  return { url: parsed.toString(), removed };
}
