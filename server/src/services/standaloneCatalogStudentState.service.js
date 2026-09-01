/**
 * Batch-load the authenticated student's attempt stats for public catalog rows.
 * Guest catalogs are unchanged — another student still sees the same tests.
 */

import { mysqlPool } from '../config/mysql.js';
import {
  EMPTY_STANDALONE_ATTEMPT_STATS,
  mapStandaloneCatalogStudentState,
} from './standaloneCatalogStudentState.presentation.js';

/**
 * @param {number} studentId
 * @param {number[]} testIds
 * @returns {Promise<Map<number, typeof EMPTY_STANDALONE_ATTEMPT_STATS>>}
 */
export async function loadStandaloneStudentAttemptStats(studentId, testIds) {
  const uid = Number(studentId);
  const ids = [...new Set((testIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  const map = new Map();
  if (!Number.isInteger(uid) || uid <= 0 || !ids.length) return map;

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `SELECT
       a.test_id,
       COUNT(*) AS total_attempts,
       SUM(a.status = 'in_progress') AS active_count,
       SUM(a.status IN ('submitted', 'expired')) AS completed_count,
       MAX(CASE WHEN a.status = 'in_progress' THEN a.id ELSE NULL END) AS active_attempt_id,
       MAX(CASE WHEN a.status IN ('submitted', 'expired') THEN a.id ELSE NULL END) AS latest_completed_attempt_id
     FROM test_attempts a
     WHERE (a.user_id = ? OR a.student_id = ?)
       AND a.test_id IN (${placeholders})
     GROUP BY a.test_id`,
    [uid, uid, ...ids]
  );

  for (const row of rows) {
    const testId = Number(row.test_id);
    map.set(testId, {
      totalAttempts: Number(row.total_attempts || 0),
      hasActiveAttempt: Number(row.active_count || 0) > 0,
      hasCompletedAttempt: Number(row.completed_count || 0) > 0,
      activeAttemptId: row.active_attempt_id != null ? Number(row.active_attempt_id) : null,
      latestCompletedAttemptId:
        row.latest_completed_attempt_id != null ? Number(row.latest_completed_attempt_id) : null,
    });
  }
  return map;
}

/**
 * Attach a per-student CTA without removing the test from the catalog.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ studentId?: number|null, kind: 'free' | 'paid' }} options
 */
export async function attachStandaloneCatalogStudentState(items, rows, { studentId, kind }) {
  const uid = Number(studentId);
  if (!Number.isInteger(uid) || uid <= 0 || !Array.isArray(items) || !items.length) {
    return items;
  }

  const statsByTestId = await loadStandaloneStudentAttemptStats(
    uid,
    (rows || []).map((row) => Number(row.id))
  );
  const rowBySlug = new Map((rows || []).map((row) => [String(row.public_slug), row]));

  return items.map((item) => {
    const row = rowBySlug.get(String(item.slug));
    if (!row) return item;
    return {
      ...item,
      student: mapStandaloneCatalogStudentState({
        kind,
        item,
        row,
        stats: statsByTestId.get(Number(row.id)) || EMPTY_STANDALONE_ATTEMPT_STATS,
      }),
    };
  });
}
