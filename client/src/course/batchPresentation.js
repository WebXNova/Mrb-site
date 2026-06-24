/** Mirrors server `COURSE_BATCH_STATUSES` — only 3 lifecycle states. */
export const BATCH_STATUSES = [
  'draft',
  'published',
  'archived',
];

/** Mirrors server `COURSE_BATCH_TIMEZONES` for admin UI selects. */
export const BATCH_TIMEZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'America/Toronto',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const STATUS_LABEL = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

/** @param {string} status */
export function batchStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  return STATUS_LABEL[s] || s || 'Unknown';
}

/** @param {string} status */
export function batchStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'running' || s === 'enrollment_open') return 'batch-badge batch-badge--live';
  if (s === 'upcoming' || s === 'draft' || s === 'published') return 'batch-badge batch-badge--pending';
  if (s === 'completed') return 'batch-badge batch-badge--done';
  if (s === 'cancelled' || s === 'archived') return 'batch-badge batch-badge--muted';
  return 'batch-badge';
}

/**
 * Convert ISO UTC timestamp to value for `<input type="datetime-local">` (browser local time).
 * @param {string|null|undefined} iso
 */
export function toLocalDatetimeValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert datetime-local input value (browser local) to ISO UTC string.
 * @param {string} local
 */
export function fromLocalDatetimeValue(local) {
  if (!local) return '';
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/**
 * @param {{ enrollment_open_at?: string|null, enrollment_close_at?: string|null }} batch
 */
export function formatEnrollmentWindow(batch) {
  const a = batch?.enrollment_open_at;
  const b = batch?.enrollment_close_at;
  if (!a || !b) return '—';
  try {
    const da = new Date(a);
    const db = new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return '—';
    return `${da.toLocaleString()} → ${db.toLocaleString()}`;
  } catch {
    return '—';
  }
}

/**
 * @param {{ total_seats?: number, seats_filled?: number, seats_remaining?: number }} batch
 */
export function formatSeatLine(batch) {
  const total = Number(batch?.total_seats ?? 0);
  const filled = Number(batch?.seats_filled ?? 0);
  const remaining =
    batch?.seats_remaining != null ? Number(batch.seats_remaining) : Math.max(0, total - filled);
  return `${remaining} / ${total} seats available (${filled} filled)`;
}

/**
 * @param {{ enrollment_open?: boolean, seats_remaining?: number, status?: string }} batch
 */
export function enrollmentStatusSummary(batch) {
  if (batch?.enrollment_open) return 'Enrollment open now';
  const rem = Number(batch?.seats_remaining ?? 0);
  if (rem <= 0) return 'Full';
  return 'Enrollment closed or not yet open';
}
