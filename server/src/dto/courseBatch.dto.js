import { COURSE_BATCH_PUBLIC_STATUSES } from '../constants/courseBatchStatus.js';
import { parseBatchTimestamp } from '../utils/batchDateTime.js';

/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {unknown} v */
function toBatchTimestampIso(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return new Date(`${s.replace(' ', 'T')}Z`).toISOString();
  }
  const ms = parseBatchTimestamp(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
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
 * Whether the batch is publicly selectable (delivery schedule + seats).
 * Course-level admission_status gates new enrollments.
 * @param {Record<string, unknown>} row
 * @param {{ now?: Date }} [opts]
 */
export function computeBatchSelectable(row, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const t = now.getTime();
  const status = String(row.status || '').toLowerCase();
  if (!row.is_active) return false;
  if (['draft', 'cancelled', 'archived', 'completed'].includes(status)) return false;
  const start = parseBatchTimestamp(row.start_date);
  const end = parseBatchTimestamp(row.end_date);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (t > end) return false;
  if (computeSeatsRemaining(row) <= 0) return false;
  return COURSE_BATCH_PUBLIC_STATUSES.includes(status);
}

/** @deprecated Use computeBatchSelectable — enrollment gating is course-level. */
export function computeEnrollmentOpen(row, opts = {}) {
  return computeBatchSelectable(row, opts);
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
    start_date: toBatchTimestampIso(row.start_date),
    end_date: toBatchTimestampIso(row.end_date),
    total_seats: Number(row.total_seats ?? 0),
    seats_remaining: seatsRemaining,
    instructor_name: row.instructor_name == null ? null : String(row.instructor_name),
    schedule_label: row.schedule_label == null ? null : String(row.schedule_label),
    timezone: String(row.timezone ?? 'UTC'),
    status: String(row.status ?? '').toLowerCase(),
    show_publicly: row.show_publicly == null ? true : Boolean(Number(row.show_publicly)),
    recordings_enabled: row.recordings_enabled == null ? true : Boolean(Number(row.recordings_enabled)),
    batch_selectable: computeBatchSelectable(row, opts),
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
