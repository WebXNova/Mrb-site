import { computeStudentTestListingStatus } from '../services/studentTestListingStatus.js';

/** @param {Record<string, unknown>} row */
export function toStudentTestListItemDto(row) {
  if (!row) return null;

  const maxAttempts = Number(row.max_attempts ?? 1);
  const attemptsUsed = Number(row.attempts_used ?? 0);
  const statusFields = computeStudentTestListingStatus({
    maxAttempts,
    attemptsUsed,
    activeAttemptId: row.active_attempt_id,
  });

  return {
    id: Number(row.id),
    title: String(row.title ?? ''),
    duration_minutes: Number(row.duration_minutes ?? 0),
    max_attempts: maxAttempts,
    passing_percentage: Number(row.passing_percentage ?? 0),
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
  passing_percentage: 'number',
  status: "'available' | 'in_progress' | 'completed'",
  active_attempt_id: 'number | null',
  attempts_used: 'number',
  attempts_remaining: 'number | null',
});
