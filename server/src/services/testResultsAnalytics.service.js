/**
 * Admin test attempt analytics for results charts.
 */

import { mysqlPool } from '../config/mysql.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';

/**
 * @param {number} testId
 */
export async function getTestResultsAnalytics(testId) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) {
    return null;
  }

  const [[testRow]] = await mysqlPool.query(
    `SELECT id, title, passing_marks FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [tid]
  );
  if (!testRow) return null;

  const [[stats]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS total_attempts,
       SUM(CASE WHEN a.status = 'submitted' THEN 1 ELSE 0 END) AS submitted_count,
       SUM(CASE WHEN a.status NOT IN ('submitted', 'expired', 'cancelled') THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN a.status = 'submitted' AND (${DERIVED_PASS_STATUS_SQL}) = 'PASS' THEN 1 ELSE 0 END) AS passed_count,
       SUM(CASE WHEN a.status = 'submitted' AND (${DERIVED_PASS_STATUS_SQL}) = 'FAIL' THEN 1 ELSE 0 END) AS failed_count,
       AVG(CASE WHEN a.status = 'submitted' THEN r.percentage ELSE NULL END) AS average_percentage
     FROM test_attempts a
     LEFT JOIN test_results r ON r.attempt_id = a.id
     INNER JOIN tests t ON t.id = a.test_id
     WHERE a.test_id = ?`,
    [tid]
  );

  const passed = Number(stats?.passed_count ?? 0);
  const failed = Number(stats?.failed_count ?? 0);
  const pending = Number(stats?.pending_count ?? 0);
  const submitted = Number(stats?.submitted_count ?? 0);
  const totalAttempts = Number(stats?.total_attempts ?? 0);
  const graded = passed + failed;
  const passRate = graded > 0 ? Math.round((passed / graded) * 100) : null;

  return {
    testId: tid,
    testTitle: String(testRow.title ?? ''),
    passingMarks: Number(testRow.passing_marks ?? 0),
    totalAttempts,
    totalSubmitted: submitted,
    passed,
    failed,
    pending,
    passRate,
    averagePercentage:
      stats?.average_percentage == null
        ? null
        : Math.round(Number(stats.average_percentage) * 100) / 100,
  };
}
