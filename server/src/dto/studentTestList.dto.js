import { computeStudentTestListingStatus } from '../services/studentTestListingStatus.js';

function toIsoOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const d = new Date(typeof value === 'string' || typeof value === 'number' ? value : String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} row */
export function toStudentTestListItemDto(row) {
  if (!row) return null;

  const maxAttempts = Number(row.max_attempts ?? 1);
  const attemptsUsed = Number(row.attempts_used ?? 0);
  const statusFields = computeStudentTestListingStatus({
    maxAttempts,
    attemptsUsed,
    activeAttemptId: row.active_attempt_id,
    allowRetake: Boolean(Number(row.allow_retake ?? 0)),
  });

  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    category: row.category == null ? null : String(row.category),
    subject_label: row.subject_label == null ? null : String(row.subject_label),
    subject_ids: Array.isArray(row.subject_ids)
      ? row.subject_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [],
    public_slug: row.public_slug == null ? null : String(row.public_slug),
    duration_minutes: Number(row.duration_minutes ?? 0),
    max_attempts: maxAttempts,
    passing_marks: Number(row.passing_marks ?? 0),
    total_marks: Number(row.total_marks ?? 0),
    start_date: toIsoOrNull(row.start_date),
    end_date: toIsoOrNull(row.end_date),
    updated_at: toIsoOrNull(row.updated_at),
    status: statusFields.status,
    active_attempt_id: statusFields.active_attempt_id,
    attempts_used: statusFields.attempts_used,
    attempts_remaining: statusFields.attempts_remaining,
  };
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 */
export function buildStudentTestListPagination(page, limit, total) {
  const totalNum = Math.max(0, Number(total) || 0);
  return {
    page,
    limit,
    total: totalNum,
    total_pages: totalNum === 0 ? 0 : Math.ceil(totalNum / limit),
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ page: number, limit: number, total: number }} paginationInput
 */
export function toStudentTestListResponse(rows, paginationInput) {
  const items = rows.map((row) => toStudentTestListItemDto(row)).filter(Boolean);
  return {
    items,
    pagination: buildStudentTestListPagination(
      paginationInput.page,
      paginationInput.limit,
      paginationInput.total
    ),
  };
}

/** @typedef {ReturnType<typeof toStudentTestListItemDto>} StudentTestListItemDto */

export const STUDENT_TEST_LIST_ITEM_SCHEMA = Object.freeze({
  id: 'number',
  title: 'string',
  duration_minutes: 'number',
  max_attempts: 'number',
  passing_marks: 'number',
  total_marks: 'number',
  status: "'available' | 'in_progress' | 'completed'",
  active_attempt_id: 'number | null',
  attempts_used: 'number',
  attempts_remaining: 'number | null',
});
