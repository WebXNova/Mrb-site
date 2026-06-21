import { batchStatusLabel } from './batchPresentation';

/** Prefer open enrollment, then batches with seats, else first listed. */
export function pickFeaturedBatch(batches) {
  if (!Array.isArray(batches) || batches.length === 0) return null;
  const open = batches.find((b) => b.enrollment_open);
  if (open) return open;
  const withSeats = batches.find((b) => Number(b.seats_remaining ?? 0) > 0);
  return withSeats || batches[0];
}

export function computeDiscountPercent(original, sale) {
  const o = Number(original);
  const s = Number(sale);
  if (!Number.isFinite(o) || !Number.isFinite(s) || o <= s || o <= 0) return null;
  return Math.round(((o - s) / o) * 100);
}

export function formatSalesAmount(amount, currency = 'PKR') {
  return `${currency} ${Number(amount || 0).toLocaleString('en-PK')}`;
}

export function formatSalesDate(isoOrDate) {
  if (!isoOrDate) return '—';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(isoOrDate);
  }
}

export function formatSalesDateLong(isoOrDate) {
  if (!isoOrDate) return '—';
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return String(isoOrDate);
    return d.toLocaleDateString('en-PK', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return String(isoOrDate);
  }
}

export function daysUntil(isoOrDate) {
  if (!isoOrDate) return null;
  try {
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return null;
    const ms = d.getTime() - Date.now();
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

export function dateOnlyToCountdownIso(dateOnly) {
  if (!dateOnly) return null;
  const raw = String(dateOnly).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T09:00:00`).toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Short conversion line for hero — uses real batch dates only. */
export function buildStartHeadline(batch) {
  if (!batch?.start_date) return null;
  const days = daysUntil(batch.start_date);
  if (days == null) return null;
  if (days < 0) return 'This cohort is already underway';
  if (days === 0) return 'Classes start today — join now';
  if (days === 1) return 'Classes start tomorrow';
  if (days <= 21) return `Only ${days} days until classes begin`;
  return `Next cohort starts ${formatSalesDate(batch.start_date)}`;
}

/**
 * @returns {Array<{ id: string, label: string, value: string, accent?: boolean }>}
 */
export function buildCohortHighlights(batch) {
  if (!batch) return [];
  /** @type {Array<{ id: string, label: string, value: string, accent?: boolean }>} */
  const items = [];

  if (batch.start_date) {
    items.push({
      id: 'start',
      label: 'Classes start',
      value: formatSalesDateLong(batch.start_date),
      accent: true,
    });
  }
  if (batch.end_date) {
    items.push({
      id: 'end',
      label: 'Program ends',
      value: formatSalesDateLong(batch.end_date),
    });
  }
  if (batch.instructor_name) {
    items.push({
      id: 'instructor',
      label: 'Instructor',
      value: String(batch.instructor_name),
    });
  }
  const total = Number(batch.total_seats ?? 0);
  const remaining = Number(batch.seats_remaining ?? 0);
  if (total > 0) {
    items.push({
      id: 'seats',
      label: 'Seats left',
      value: `${remaining} of ${total}`,
      accent: remaining > 0 && remaining <= Math.max(5, Math.floor(total * 0.25)),
    });
  }
  if (batch.schedule_label) {
    items.push({
      id: 'schedule',
      label: 'Schedule',
      value: batch.schedule_label,
    });
  }
  if (batch.timezone) {
    items.push({
      id: 'tz',
      label: 'Timezone',
      value: formatTimezoneLabel(batch.timezone),
    });
  }

  return items;
}

export function buildEnrollmentPitch(batch, pricingDisplay) {
  if (!batch) {
    return pricingDisplay?.isFree
      ? 'Enroll free and start learning immediately.'
      : 'Secure your spot and start learning with MRB Classes.';
  }
  if (batch.enrollment_open) {
    const daysToStart = daysUntil(batch.start_date);
    if (daysToStart != null && daysToStart > 0 && daysToStart <= 14) {
      return `Enrollment is open — classes begin in ${daysToStart} day${daysToStart === 1 ? '' : 's'}. Reserve your seat before it fills.`;
    }
    return 'Enrollment is open now. Lock in today’s price and secure your seat.';
  }
  const rem = Number(batch.seats_remaining ?? 0);
  if (rem <= 0) return 'This cohort is full. Browse other courses or check back for the next intake.';
  if (batch.enrollment_open_at) {
    const daysToOpen = daysUntil(batch.enrollment_open_at);
    if (daysToOpen != null && daysToOpen > 0) {
      return `Enrollment opens ${formatSalesDate(batch.enrollment_open_at)}. Classes start ${formatSalesDate(batch.start_date)}.`;
    }
  }
  if (batch.start_date) {
    return `Next intake begins ${formatSalesDate(batch.start_date)}. Prepare early — seats are limited.`;
  }
  return 'Join the next cohort and learn with structured support from MRB Classes.';
}

export function shouldShowSeatUrgency(batch) {
  if (!batch) return false;
  const remaining = Number(batch.seats_remaining ?? 0);
  const total = Number(batch.total_seats ?? 0);
  if (remaining <= 0 || total <= 0) return false;
  return remaining <= 15 || remaining / total <= 0.35;
}

/**
 * Pick the best live countdown target from real batch dates (never synthetic).
 * @returns {{ deadlineIso: string, label: string, expiredMessage: string } | null}
 */
export function resolveActiveCountdown(batch) {
  if (!batch) return null;

  /** @type {Array<{ deadlineIso: string, label: string, expiredMessage: string }>} */
  const candidates = [];

  if (batch.enrollment_close_at) {
    const parts = getCountdownParts(batch.enrollment_close_at);
    if (parts && !parts.expired) {
      candidates.push({
        deadlineIso: batch.enrollment_close_at,
        label: batch.enrollment_open ? 'Enrollment closes in' : 'Enrollment deadline in',
        expiredMessage: 'Enrollment closed',
      });
    }
  }

  if (!batch.enrollment_open && batch.enrollment_open_at) {
    const parts = getCountdownParts(batch.enrollment_open_at);
    if (parts && !parts.expired) {
      candidates.push({
        deadlineIso: batch.enrollment_open_at,
        label: 'Enrollment opens in',
        expiredMessage: 'Enrollment is open',
      });
    }
  }

  if (batch.start_date) {
    const startIso = dateOnlyToCountdownIso(batch.start_date);
    const parts = startIso ? getCountdownParts(startIso) : null;
    if (parts && !parts.expired) {
      candidates.push({
        deadlineIso: startIso,
        label: 'Classes begin in',
        expiredMessage: 'Classes have started',
      });
    }
  }

  if (!candidates.length) return null;

  // Prefer enrollment close while open, else soonest deadline.
  if (batch.enrollment_open && batch.enrollment_close_at) {
    const close = candidates.find((c) => c.deadlineIso === batch.enrollment_close_at);
    if (close) return close;
  }

  return candidates.sort((a, b) => {
    const ta = Date.parse(a.deadlineIso);
    const tb = Date.parse(b.deadlineIso);
    return ta - tb;
  })[0];
}

export function formatTimezoneLabel(tz) {
  const s = String(tz || '').trim();
  if (!s) return '';
  return s.replace(/_/g, ' ');
}

/** @returns {{ total: number, days: number, hours: number, minutes: number, seconds: number, expired: boolean } | null} */
export function getCountdownParts(deadlineIso) {
  if (!deadlineIso) return null;
  const end = Date.parse(String(deadlineIso));
  if (!Number.isFinite(end)) return null;
  const total = end - Date.now();
  if (total <= 0) {
    return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }
  const seconds = Math.floor(total / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return { total, days, hours, minutes, seconds: secs, expired: false };
}

export function buildTrustBadges({ batch, subjectsCount, pricingDisplay }) {
  /** @type {Array<{ id: string, label: string, detail?: string }>} */
  const badges = [];

  if (batch?.recordings_enabled) {
    badges.push({ id: 'recordings', label: 'Session recordings', detail: 'Rewatch lectures anytime' });
  }
  if (subjectsCount > 0) {
    badges.push({
      id: 'curriculum',
      label: `${subjectsCount} structured unit${subjectsCount === 1 ? '' : 's'}`,
      detail: 'Organized learning path',
    });
  }
  if (batch?.schedule_label) {
    badges.push({
      id: 'schedule',
      label: 'Live schedule',
      detail: batch.schedule_label,
    });
  }
  if (pricingDisplay && !pricingDisplay.isFree && pricingDisplay.original) {
    const pct = computeDiscountPercent(pricingDisplay.original, pricingDisplay.amount);
    if (pct != null) {
      badges.push({ id: 'savings', label: `${pct}% off today`, detail: 'Limited-time pricing' });
    }
  }

  return badges;
}

export function batchHeadline(batch) {
  if (!batch) return null;
  const status = batchStatusLabel(batch.status);
  const parts = [batch.title, status].filter(Boolean);
  return parts.join(' · ');
}
