/**
 * Lecture content gating — batch lifecycle + optional sequential prerequisites.
 */

import { BATCH_LECTURE_ACCESS_STATUSES } from '../constants/lectureGating.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';

const LECTURE_PLAYLIST_SQL = `
  SELECT l.id, l.title, l.sort_order, l.created_at,
         ch.order_index AS chapter_order_index,
         s.order_index AS subject_order_index
  FROM lectures l
  INNER JOIN courses c ON c.id = l.course_id AND c.is_active = TRUE
  INNER JOIN chapters ch ON ch.id = l.chapter_id AND ch.is_active = TRUE
  INNER JOIN subjects s ON s.id = ch.subject_id AND s.course_id = l.course_id AND s.is_active = TRUE
  WHERE l.course_id = ?
    AND l.is_active = TRUE
  ORDER BY s.order_index ASC, ch.order_index ASC, l.sort_order ASC, l.created_at ASC`;

/**
 * @param {number} courseId
 */
export async function fetchOrderedLectureRows(courseId) {
  const db = scopedQuery({ courseId, context: 'lectureGating.fetchOrderedLectureRows' });
  return db.rows(LECTURE_PLAYLIST_SQL, [courseId]);
}

/**
 * @param {number} courseId
 */
export async function fetchCourseBatchRowForGating(courseId) {
  const db = scopedQuery({ courseId, context: 'lectureGating.fetchCourseBatchRowForGating' });
  const rows = await db.rows(
    `SELECT id, status, is_active, sequential_lectures_enabled
     FROM course_batches
     WHERE course_id = ? AND is_active = TRUE
     ORDER BY start_date ASC, id ASC
     LIMIT 1`,
    [courseId]
  );
  return rows[0] ?? null;
}

/**
 * @param {Record<string, unknown>|null|undefined} batchRow
 * @returns {{ locked: boolean, unlockReason: string|null }}
 */
export function evaluateBatchContentGate(batchRow) {
  if (!batchRow) {
    return {
      locked: true,
      unlockReason: 'Course schedule is not configured yet.',
    };
  }

  if (!Boolean(Number(batchRow.is_active))) {
    return {
      locked: true,
      unlockReason: 'This course cohort is not active.',
    };
  }

  const status = String(batchRow.status || '').toLowerCase();
  if (BATCH_LECTURE_ACCESS_STATUSES.includes(status)) {
    return { locked: false, unlockReason: null };
  }

  if (status === 'archived') {
    return {
      locked: true,
      unlockReason: 'This course cohort is no longer available.',
    };
  }

  // draft — enrolled students can access
  return { locked: false, unlockReason: null };
}

/**
 * @param {Record<string, unknown>|null|undefined} batchRow
 */
export function isSequentialLecturesEnabled(batchRow) {
  return Boolean(Number(batchRow?.sequential_lectures_enabled ?? 0));
}

/**
 * @param {Array<Record<string, unknown>>} orderedRows — playlist order
 * @param {{ batch?: Record<string, unknown>|null, completedIds?: Set<number> }} ctx
 * @returns {Map<number, { locked: boolean, unlockReason: string|null }>}
 */
export function computeLectureLockStates(orderedRows, { batch = null, completedIds = new Set() } = {}) {
  const locks = new Map();
  const batchGate = evaluateBatchContentGate(batch);

  if (batchGate.locked) {
    for (const row of orderedRows) {
      locks.set(Number(row.id), { locked: true, unlockReason: batchGate.unlockReason });
    }
    return locks;
  }

  const sequential = isSequentialLecturesEnabled(batch);

  for (let i = 0; i < orderedRows.length; i++) {
    const row = orderedRows[i];
    const lectureId = Number(row.id);

    if (!sequential || i === 0) {
      locks.set(lectureId, { locked: false, unlockReason: null });
      continue;
    }

    let locked = false;
    let unlockReason = null;

    for (let j = 0; j < i; j++) {
      const prev = orderedRows[j];
      const prevId = Number(prev.id);
      if (!completedIds.has(prevId)) {
        locked = true;
        unlockReason = `Complete the previous lecture first: ${String(prev.title || 'Previous lecture')}`;
        break;
      }
    }

    locks.set(lectureId, { locked, unlockReason });
  }

  return locks;
}

/**
 * @param {number} lectureId
 * @param {Array<Record<string, unknown>>} orderedRows
 * @param {{ batch?: Record<string, unknown>|null, completedIds?: Set<number> }} ctx
 */
export function getLectureLockState(lectureId, orderedRows, ctx) {
  const locks = computeLectureLockStates(orderedRows, ctx);
  return locks.get(Number(lectureId)) || { locked: false, unlockReason: null };
}
