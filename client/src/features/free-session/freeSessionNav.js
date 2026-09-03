const GUEST_KEY = (slug) => `freeSessionGuest:${slug}`;

export function freeTestPath(slug, suffix = '') {
  const base = `/free-test/${encodeURIComponent(String(slug || '').trim())}`;
  return suffix ? `${base}/${suffix}` : base;
}

export function isFreeSessionReturnPath(path) {
  return String(path || '').startsWith('/free-test/');
}

export function markFreeSessionGuest(slug, isGuest) {
  try {
    if (isGuest) sessionStorage.setItem(GUEST_KEY(slug), '1');
    else sessionStorage.removeItem(GUEST_KEY(slug));
  } catch {
    /* ignore */
  }
}

export function isFreeGuestRuntime(slug) {
  if (typeof window !== 'undefined' && isFreeSessionReturnPath(window.location.pathname)) {
    return true;
  }
  try {
    return sessionStorage.getItem(GUEST_KEY(slug)) === '1';
  } catch {
    return false;
  }
}

export function freeSessionPostSubmitPath(slug, payload = {}) {
  const freePath =
    isFreeGuestRuntime(slug) ||
    payload?.nextStep === 'enrollment' ||
    payload?.nextStep === 'account';
  if (freePath) {
    if (payload?.nextStep === 'account') return freeTestPath(slug, 'claim');
    if (payload?.nextStep === 'result') {
      return payload?.resultAvailable === false ? freeTestPath(slug, 'submitted') : freeTestPath(slug, 'result');
    }
    return freeTestPath(slug, 'enroll');
  }
  if (payload?.resultAvailable === false) return `/tests/${slug}/submitted`;
  return `/tests/${slug}/result`;
}
