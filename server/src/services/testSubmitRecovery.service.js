/**
 * Recovery for partial test submission corruption.
 *
 * Scenarios handled:
 * - test_results row exists but attempt still in_progress (crash after INSERT, before UPDATE)
 * - attempt submitted but result_id not linked (crash after status lock, before LINK)
 * - duplicate submit retries (idempotent complete response)
 */

import { StructuredLogger } from '../utils/requestId.js';
import { AttemptInvalidStateError } from '../errors/testAttempt/TestAttemptErrors.js';

const logger = new StructuredLogger({ service: 'testSubmitRecovery' });

/**
 * ScopedQueryRunner.execute() returns mysql2's [ResultSetHeader, fields] tuple.
 * @param {unknown} raw
 * @returns {number}
 */
function readExecuteAffectedRows(raw) {
  const header = Array.isArray(raw) ? raw[0] : raw;
  return Number(header?.affectedRows ?? 0);
}

export const SUBMIT_RECOVERY_OUTCOMES = Object.freeze({
  ALREADY_COMPLETE: 'already_complete',
  RECOVERED_IN_PROGRESS: 'recovered_in_progress_with_result',
  LINKED_MISSING_RESULT_ID: 'linked_missing_result_id',
  REGRADED_SUBMITTED_WITHOUT_RESULT: 'regraded_submitted_without_result',
});

/**
 * @typedef {object} ScopedDb
 * @property {(sql: string, params?: unknown[]) => Promise<unknown>} execute
 * @property {(sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>} rows
 */

/**
 * @param {ScopedDb} db
 * @param {{ attemptId: number, courseId: number, userId: number }} params
 */
export async function loadAttemptSubmissionState(db, { attemptId, courseId, userId }) {
  const rows = await db.rows(
    `SELECT a.status,
            a.result_id AS attempt_result_id,
            r.id AS result_id
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     LEFT JOIN test_results r ON r.attempt_id = a.id
     WHERE a.id = ? AND a.user_id = ?
     LIMIT 1`,
    [courseId, attemptId, userId]
  );
  return rows[0] ?? null;
}

/**
 * Finalize attempt after a persisted result — idempotent for recovery paths.
 *
 * @param {ScopedDb} db
 * @param {{
 *   attemptId: number,
 *   courseId: number,
 *   userId: number,
 *   resultId: number,
 *   completionReason?: string,
 * }} params
 */
export async function finalizeAttemptAfterResult(
  db,
  { attemptId, courseId, userId, resultId, completionReason = 'submitted' }
) {
  const raw = await db.execute(
    `UPDATE test_attempts a
     INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
     SET a.status = 'submitted',
         a.submitted_at = COALESCE(a.submitted_at, UTC_TIMESTAMP()),
         a.completion_reason = COALESCE(a.completion_reason, ?),
         a.result_id = ?,
         a.updated_at = CURRENT_TIMESTAMP
     WHERE a.id = ?
       AND a.user_id = ?
       AND (
         a.status = 'in_progress'
         OR (a.status = 'submitted' AND (a.result_id IS NULL OR a.result_id = ?))
       )`,
    [courseId, completionReason, resultId, attemptId, userId, resultId]
  );
  return readExecuteAffectedRows(raw);
}

/**
 * Resolve idempotent completion or partial-state recovery before/alongside grading.
 *
 * @param {ScopedDb} db
 * @param {{
 *   attemptId: number,
 *   courseId: number,
 *   userId: number,
 *   status: string,
 *   resultId?: number|null,
 * }} params
 * @returns {Promise<
 *   | { action: 'complete', resultId: number, recovered: boolean, outcome: string }
 *   | { action: 'proceed', recovered?: boolean, outcome?: string }
 * >}
 */
export async function resolveSubmitAttemptOutcome(db, params) {
  const attemptId = Number(params.attemptId);
  const courseId = Number(params.courseId);
  const userId = Number(params.userId);
  const currentStatus = String(params.status);
  const attemptResultId =
    params.resultId == null || params.resultId === undefined ? null : Number(params.resultId);

  const row = await loadAttemptSubmissionState(db, { attemptId, courseId, userId });
  const existingResultId = row?.result_id != null ? Number(row.result_id) : null;

  if (existingResultId != null) {
    if (
      currentStatus === 'submitted' &&
      attemptResultId != null &&
      attemptResultId === existingResultId
    ) {
      return {
        action: 'complete',
        resultId: existingResultId,
        recovered: false,
        outcome: SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE,
      };
    }

    const affected = await finalizeAttemptAfterResult(db, {
      attemptId,
      courseId,
      userId,
      resultId: existingResultId,
    });

    if (affected > 0 || currentStatus === 'submitted') {
      const outcome =
        currentStatus === 'in_progress'
          ? SUBMIT_RECOVERY_OUTCOMES.RECOVERED_IN_PROGRESS
          : SUBMIT_RECOVERY_OUTCOMES.LINKED_MISSING_RESULT_ID;

      logger.warn('Recovered partial test submission state', {
        event: 'TEST_SUBMIT_RECOVERY',
        attemptId,
        userId,
        courseId,
        resultId: existingResultId,
        priorStatus: currentStatus,
        outcome,
        rowsUpdated: affected,
      });

      return {
        action: 'complete',
        resultId: existingResultId,
        recovered: currentStatus === 'in_progress',
        outcome,
      };
    }

    if (currentStatus === 'submitted') {
      return {
        action: 'complete',
        resultId: existingResultId,
        recovered: false,
        outcome: SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE,
      };
    }
  }

  if (currentStatus === 'submitted') {
    logger.warn('Recovering submitted attempt without persisted result — re-entering grading path', {
      event: 'TEST_SUBMIT_RECOVERY',
      attemptId,
      userId,
      courseId,
      priorStatus: currentStatus,
      outcome: SUBMIT_RECOVERY_OUTCOMES.REGRADED_SUBMITTED_WITHOUT_RESULT,
    });
    return {
      action: 'proceed',
      recovered: true,
      outcome: SUBMIT_RECOVERY_OUTCOMES.REGRADED_SUBMITTED_WITHOUT_RESULT,
    };
  }

  if (currentStatus !== 'in_progress') {
    throw new AttemptInvalidStateError({
      attemptId,
      status: currentStatus,
      required: 'in_progress',
    });
  }

  return { action: 'proceed' };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ attemptId: number, studentId: number }} params
 * @param {{ forUpdate?: boolean }} [options]
 */
export async function loadLegacyAttemptSubmissionState(
  connection,
  { attemptId, studentId },
  { forUpdate = false } = {}
) {
  const aid = Number(attemptId);
  const sid = Number(studentId);
  const lockClause = forUpdate ? 'FOR UPDATE' : '';

  const [rows] = await connection.query(
    `SELECT a.status,
            a.result_id AS attempt_result_id,
            r.id AS existing_result_id
     FROM test_attempts a
     LEFT JOIN test_results r ON r.attempt_id = a.id
     WHERE a.id = ? AND a.student_id = ?
     LIMIT 1
     ${lockClause}`,
    [aid, sid]
  );
  return rows[0] ?? null;
}

/**
 * Finalize attempt after a persisted result — legacy submit path (student_id scoped).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   attemptId: number,
 *   studentId: number,
 *   resultId: number,
 *   completionReason?: string,
 * }} params
 */
export async function finalizeLegacyAttemptAfterResult(
  connection,
  { attemptId, studentId, resultId, completionReason = 'submitted' }
) {
  const [result] = await connection.query(
    `UPDATE test_attempts
     SET status = 'submitted',
         submitted_at = COALESCE(submitted_at, UTC_TIMESTAMP()),
         completion_reason = COALESCE(completion_reason, ?),
         result_id = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND student_id = ?
       AND (
         status = 'in_progress'
         OR (status = 'submitted' AND (result_id IS NULL OR result_id = ?))
       )`,
    [completionReason, resultId, attemptId, studentId, resultId]
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * Resolve idempotent completion or partial-state recovery for legacy submit path.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ attemptId: number, studentId: number }} params
 * @param {(attemptId: number, connection: import('mysql2/promise').PoolConnection) => Promise<{ resultId: number }>} [gradeAttemptFn]
 * @param {{ forUpdate?: boolean }} [options]
 * @returns {Promise<
 *   | { action: 'complete', attemptId: number, resultId: number, recovered: boolean, outcome: string }
 *   | { action: 'proceed' }
 * >}
 */
export async function resolveLegacySubmitAttemptOutcome(
  connection,
  { attemptId, studentId },
  gradeAttemptFn,
  { forUpdate = true } = {}
) {
  const aid = Number(attemptId);
  const sid = Number(studentId);

  const row = await loadLegacyAttemptSubmissionState(
    connection,
    { attemptId: aid, studentId: sid },
    { forUpdate }
  );
  if (!row) {
    return { action: 'proceed' };
  }

  const currentStatus = String(row.status);
  const attemptResultId =
    row.attempt_result_id != null ? Number(row.attempt_result_id) : null;
  const existingResultId =
    row.existing_result_id != null ? Number(row.existing_result_id) : null;

  if (existingResultId != null) {
    if (currentStatus === 'submitted' && attemptResultId === existingResultId) {
      return {
        action: 'complete',
        attemptId: aid,
        resultId: existingResultId,
        recovered: false,
        outcome: SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE,
      };
    }

    const affected = await finalizeLegacyAttemptAfterResult(connection, {
      attemptId: aid,
      studentId: sid,
      resultId: existingResultId,
    });

    if (affected > 0 || currentStatus === 'submitted') {
      const outcome =
        currentStatus === 'in_progress'
          ? SUBMIT_RECOVERY_OUTCOMES.RECOVERED_IN_PROGRESS
          : SUBMIT_RECOVERY_OUTCOMES.LINKED_MISSING_RESULT_ID;

      logger.warn('Recovered partial test submission state', {
        event: 'TEST_SUBMIT_RECOVERY',
        attemptId: aid,
        studentId: sid,
        resultId: existingResultId,
        priorStatus: currentStatus,
        outcome,
        rowsUpdated: affected,
        path: 'legacy_submit',
      });

      return {
        action: 'complete',
        attemptId: aid,
        resultId: existingResultId,
        recovered: currentStatus === 'in_progress',
        outcome,
      };
    }

    if (currentStatus === 'submitted') {
      return {
        action: 'complete',
        attemptId: aid,
        resultId: existingResultId,
        recovered: false,
        outcome: SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE,
      };
    }
  }

  if (currentStatus === 'submitted' && gradeAttemptFn) {
    let resultId = attemptResultId;

    if (!resultId) {
      const graded = await gradeAttemptFn(aid, connection);
      resultId = Number(graded.resultId);
    }

    if (!resultId) {
      return { action: 'proceed' };
    }

    await connection.query(
      `UPDATE test_attempts
       SET result_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND student_id = ?
         AND status = 'submitted'`,
      [resultId, aid, sid]
    );

    logger.warn('Recovered legacy submitted attempt', {
      event: 'TEST_SUBMIT_LEGACY_RECOVERY',
      attemptId: aid,
      studentId: sid,
      resultId,
    });

    return {
      action: 'complete',
      attemptId: aid,
      resultId,
      recovered: true,
      outcome: SUBMIT_RECOVERY_OUTCOMES.LINKED_MISSING_RESULT_ID,
    };
  }

  return { action: 'proceed' };
}

/**
 * Recover legacy runtime submit when attempt is already submitted.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ attemptId: number, studentId: number }} params
 * @param {(attemptId: number, connection: import('mysql2/promise').PoolConnection) => Promise<{ resultId: number }>} gradeAttemptFn
 */
export async function recoverLegacySubmittedAttempt(
  connection,
  { attemptId, studentId },
  gradeAttemptFn
) {
  const outcome = await resolveLegacySubmitAttemptOutcome(
    connection,
    { attemptId, studentId },
    gradeAttemptFn,
    { forUpdate: false }
  );

  if (outcome.action !== 'complete') {
    return null;
  }

  return {
    attemptId: outcome.attemptId,
    resultId: outcome.resultId,
    recovered: outcome.recovered,
  };
}
