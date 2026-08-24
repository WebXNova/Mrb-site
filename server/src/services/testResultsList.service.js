import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';
import { assertTestMutationAccess } from './testMutationAccess.service.js';

/**
 * @param {number[]} attemptIds
 */
async function loadViolationsByAttemptIds(attemptIds) {
  const ids = [...new Set(attemptIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `SELECT attempt_id, violation_number, violation_type, occurred_at
     FROM test_cheating_violations
     WHERE attempt_id IN (${placeholders})
     ORDER BY attempt_id ASC, violation_number ASC`,
    ids
  );

  /** @type {Map<number, Array<{ violation_number: number, violation_type: string, occurred_at: string }>>} */
  const map = new Map();
  for (const row of rows) {
    const attemptId = Number(row.attempt_id);
    const list = map.get(attemptId) ?? [];
    list.push({
      violation_number: Number(row.violation_number),
      violation_type: String(row.violation_type ?? ''),
      occurred_at: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    });
    map.set(attemptId, list);
  }
  return map;
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} [access]
 */
export async function listAdminTestResults(testId, access = {}) {
  const tid = Number(testId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'read_results',
    });
  }

  const [testRows] = await mysqlPool.query(
    `SELECT id, title, status, results_released_at
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  const testRow = testRows[0];
  if (!testRow) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  const [attemptRows] = await mysqlPool.query(
    `SELECT
       a.id AS attempt_id,
       a.status AS attempt_status,
       a.submitted_at,
       a.started_at,
       a.is_flagged_cheating,
       COALESCE(a.student_name, u.full_name, u.username, 'Student') AS student_name,
       r.score,
       r.max_score,
       r.percentage,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status,
       r.time_taken_seconds
     FROM test_attempts a
     LEFT JOIN test_results r ON r.attempt_id = a.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
       AND a.status = 'submitted'
     ORDER BY a.submitted_at DESC, a.id DESC`,
    [tid]
  );

  const flaggedIds = attemptRows
    .filter((row) => Number(row.is_flagged_cheating) === 1)
    .map((row) => Number(row.attempt_id));
  const violationsByAttempt = await loadViolationsByAttemptIds(flaggedIds);

  return {
    testId: tid,
    testTitle: String(testRow.title ?? ''),
    results_released_at: testRow.results_released_at
      ? new Date(testRow.results_released_at).toISOString()
      : null,
    attempts: attemptRows.map((row) => {
      const attemptId = Number(row.attempt_id);
      const isFlagged = Number(row.is_flagged_cheating) === 1;
      return {
        attempt_id: attemptId,
        student_name: String(row.student_name ?? 'Student'),
        submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
        started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
        score: row.score == null ? null : Number(row.score),
        max_score: row.max_score == null ? null : Number(row.max_score),
        percentage: row.percentage == null ? null : Number(row.percentage),
        pass_status: row.pass_status == null ? null : String(row.pass_status),
        time_taken_seconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
        is_flagged_cheating: isFlagged,
        violations: isFlagged ? violationsByAttempt.get(attemptId) ?? [] : [],
      };
    }),
  };
}
