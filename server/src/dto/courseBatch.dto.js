import { COURSE_BATCH_PUBLIC_STATUSES } from '../constants/courseBatchStatus.js';

/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {unknown} v */
function toDateOnlyString(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 */
export function computeSeatsRemaining(row, _opts = {}) {
  const total = Number(row.total_seats ?? 0);
  const filled = Number(row.seats_filled ?? 0);
  return Math.max(0, total - filled);
}

/**
 * Whether enrollment is currently open (server-side, do not trust clients).
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 */
export function computeEnrollmentOpen(row, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const t = now.getTime();
  const status = String(row.status || '').toLowerCase();
  if (!row.is_active) return false;
  if (row.allow_enrollment != null && !Number(row.allow_enrollment)) return false;
  if (['draft', 'cancelled', 'archived', 'completed'].includes(status)) return false;
  const open = Date.parse(String(row.enrollment_open_at ?? ''));
  const close = Date.parse(String(row.enrollment_close_at ?? ''));
  if (!Number.isFinite(open) || !Number.isFinite(close)) return false;
  if (t < open || t > close) return false;
  if (computeSeatsRemaining(row) <= 0) return false;
  return COURSE_BATCH_PUBLIC_STATUSES.includes(status);
}

/**
 * Public batch JSON (snake_case contract).
 * @param {Record<string, unknown>} row
 */
export function toCourseBatchPublicDto(row, opts = {}) {
  if (!row) return null;
  const seatsRemaining = computeSeatsRemaining(row, opts);
  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    code: String(row.code ?? ''),
    start_date: toDateOnlyString(row.start_date),
    end_date: toDateOnlyString(row.end_date),
    enrollment_open_at: toIsoTimestamp(row.enrollment_open_at),
    enrollment_close_at: toIsoTimestamp(row.enrollment_close_at),
    total_seats: Number(row.total_seats ?? 0),
    seats_remaining: seatsRemaining,
    instructor_name: row.instructor_name == null ? null : String(row.instructor_name),
    schedule_label: row.schedule_label == null ? null : String(row.schedule_label),
    timezone: String(row.timezone ?? 'UTC'),
    status: String(row.status ?? '').toLowerCase(),
    allow_enrollment: row.allow_enrollment == null ? true : Boolean(Number(row.allow_enrollment)),
    show_publicly: row.show_publicly == null ? true : Boolean(Number(row.show_publicly)),
    certificate_enabled: row.certificate_enabled == null ? false : Boolean(Number(row.certificate_enabled)),
    recordings_enabled: row.recordings_enabled == null ? true : Boolean(Number(row.recordings_enabled)),
    enrollment_open: computeEnrollmentOpen(row, opts),
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
  };
}

/**
 * Admin batch JSON (snake_case aligned with course public API style).
 * @param {Record<string, unknown>} row
 */
export function toCourseBatchAdminDto(row, opts = {}) {
  const pub = toCourseBatchPublicDto(row, opts);
  if (!pub) return null;
  return {
    ...pub,
    course_id: Number(row.course_id),
    seats_filled: Number(row.seats_filled ?? 0),
    is_active: Boolean(row.is_active),
    created_by:
      row.created_by != null && row.created_by !== '' && Number.isFinite(Number(row.created_by))
        ? Number(row.created_by)
        : null,
  };
}
