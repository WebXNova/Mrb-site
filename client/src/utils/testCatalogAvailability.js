/**
 * Public catalog availability labels. Does not invent seat counts.
 * Prefer server `listingStatus` (UTC clock). Client date fallback is last resort.
 * Per-student Start/Register CTAs come from the catalog API `student` field
 * (existing retake policy), not from client-side hiding.
 */

export const PRODUCT_DISPLAY_TIMEZONE = 'Asia/Karachi';

export function isPastDate(value, nowMs = Date.now()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < nowMs;
}

export function isFutureDate(value, nowMs = Date.now()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > nowMs;
}

function deriveListingStatus(test, nowMs = Date.now()) {
  if (test?.listingStatus) return String(test.listingStatus);
  const endPast = test?.endDate ? new Date(test.endDate).getTime() <= nowMs : false;
  if (endPast) return 'expired';
  if (test?.examOpen === false) return 'closed';
  if (isFutureDate(test?.startDate, nowMs)) return 'upcoming';
  return 'live';
}

/**
 * @param {{
 *   examOpen?: boolean,
 *   seatsFull?: boolean,
 *   startDate?: string|null,
 *   endDate?: string|null,
 *   listingStatus?: string|null,
 * }} test
 * @param {{ kind?: 'free' | 'paid' }} [options]
 */
export function catalogAvailability(test, options = {}) {
  const kind = options.kind === 'paid' ? 'paid' : 'free';
  if (test?.seatsFull) {
    return { label: 'Full', tone: 'full', canAct: false };
  }

  const status = deriveListingStatus(test);

  if (status === 'expired') {
    return { label: 'Expired', tone: 'closed', canAct: false };
  }
  if (status === 'closed') {
    return { label: 'Closed', tone: 'closed', canAct: false };
  }
  if (status === 'upcoming') {
    return { label: 'Upcoming', tone: 'upcoming', canAct: false };
  }

  return {
    label: 'Open',
    tone: kind === 'paid' ? 'registration' : 'open',
    canAct: true,
  };
}

export function standaloneResultHref(test, kind) {
  const slug = encodeURIComponent(test?.slug || '');
  const attemptId = Number(test?.student?.attemptId || 0);
  if (!slug || !attemptId) return null;
  const accessKind = kind === 'paid' ? 'paid_standalone' : 'free_standalone';
  return `/tests/${slug}/result?attemptId=${encodeURIComponent(attemptId)}&kind=${accessKind}`;
}

export function standaloneCatalogLandingHref(test, kind) {
  const slug = encodeURIComponent(test?.slug || '');
  if (!slug) return kind === 'paid' ? '/paid-tests' : '/paid-tests#free-tests';
  return kind === 'paid' ? `/paid-tests/${slug}` : `/free-test/${slug}`;
}

/**
 * Prefer the server-provided student CTA. Guests and unauthenticated catalogs
 * keep the public availability action.
 *
 * @param {Record<string, unknown>} test
 * @param {{ label: string, tone: string, canAct: boolean }} availability
 * @param {{ kind?: 'free' | 'paid' }} [options]
 */
export function resolveCatalogCardAction(test, availability, options = {}) {
  const kind = options.kind === 'paid' ? 'paid' : 'free';
  const student = test?.student;
  const landing = standaloneCatalogLandingHref(test, kind);
  const resultHref = standaloneResultHref(test, kind);

  if (student?.ctaLabel) {
    const usesResult =
      (student.action === 'view_details' || student.action === 'view_status') && resultHref;
    return {
      ctaLabel: String(student.ctaLabel),
      to: usesResult ? resultHref : landing,
      availabilityLabel: student.availabilityLabel || availability.label,
      availabilityTone: student.availabilityTone || availability.tone,
    };
  }

  const paidCanRegister = kind === 'paid' && availability.label !== 'Expired' && availability.label !== 'Full';

  return {
    ctaLabel: availability.canAct
      ? kind === 'paid'
        ? 'Register for Test'
        : 'Start Test'
      : paidCanRegister
        ? 'Register for Test'
        : 'View details',
    to: landing,
    availabilityLabel: availability.label,
    availabilityTone: availability.tone,
  };
}

export function formatStandaloneDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-GB', {
    timeZone: PRODUCT_DISPLAY_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
