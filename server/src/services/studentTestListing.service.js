/**
 * Student test listing — eligible published tests for owned courses (Phase 1C + 1D status).
 *
 * Page of eligible tests first, then batch attempt + marks aggregates for those IDs only (no N+1).
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { StructuredLogger } from '../utils/requestId.js';
import { toStudentTestListResponse } from '../dto/studentTestList.dto.js';
import { loadTestSubjectPresentationBatch } from './testSubjectPresentation.service.js';
import {
  COUNT_STUDENT_ELIGIBLE_TESTS_SQL,
  LIST_STUDENT_ELIGIBLE_TESTS_SQL,
  buildStudentEligibleTestsBaseParams,
  buildListStudentEligibleTestsParams,
  buildStudentAttemptAggregatesForTestsSql,
  buildStudentTestMarksForTestsSql,
} from './studentTestListing.queries.js';
import { computeStudentTestListingStatus } from './studentTestListingStatus.js';

const logger = new StructuredLogger({ service: 'studentTestListing' });

/**
 * @param {unknown} studentId
 * @returns {number}
 */
function requireStudentId(studentId) {
  const id = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(401, 'Authentication required', { code: 'UNAUTHORIZED' });
  }
  return id;
}

/**
 * List published, non-deleted tests belonging to courses the student owns.
 *
 * @param {number} studentId — authenticated users.id
 * @param {{ page: number, limit: number }} query
 * @returns {Promise<{ items: import('../dto/studentTestList.dto.js').StudentTestListItemDto[], pagination: object }>}
 */
export async function listStudentEligibleTests(studentId, query) {
  const uid = requireStudentId(studentId);
  const page = query.page;
  const limit = query.limit;
  const offset = (page - 1) * limit;
  const baseParams = buildStudentEligibleTestsBaseParams(uid);
  const listParams = buildListStudentEligibleTestsParams(uid, limit, offset);

  logger.info('student test listing requested', { studentId: uid, page, limit, withStatus: true });

  try {
    const [[countRow]] = await mysqlPool.query(COUNT_STUDENT_ELIGIBLE_TESTS_SQL, baseParams);
    const total = Number(countRow?.total ?? 0);

    if (total === 0) {
      logger.debug('student test listing empty', { studentId: uid, reason: 'no_eligible_tests' });
      return toStudentTestListResponse([], { page, limit, total: 0 });
    }

    const [rows] = await mysqlPool.query(LIST_STUDENT_ELIGIBLE_TESTS_SQL, listParams);
    const testIds = rows.map((row) => Number(row.id));

    const attemptQuery = buildStudentAttemptAggregatesForTestsSql(uid, testIds);
    const marksQuery = buildStudentTestMarksForTestsSql(testIds);

    const [attemptRows, marksRows, presentationByTestId] = await Promise.all([
      attemptQuery
        ? mysqlPool.query(attemptQuery.sql, attemptQuery.params).then(([r]) => r)
        : Promise.resolve([]),
      marksQuery
        ? mysqlPool.query(marksQuery.sql, marksQuery.params).then(([r]) => r)
        : Promise.resolve([]),
      loadTestSubjectPresentationBatch(testIds),
    ]);

    /** @type {Map<number, { attempts_used: number, active_attempt_id: unknown }>} */
    const attemptsByTestId = new Map();
    for (const row of attemptRows) {
      attemptsByTestId.set(Number(row.test_id), {
        attempts_used: Number(row.attempts_used ?? 0),
        active_attempt_id: row.active_attempt_id ?? null,
      });
    }

    /** @type {Map<number, { total_marks: number, question_count: number }>} */
    const marksByTestId = new Map();
    for (const row of marksRows) {
      marksByTestId.set(Number(row.test_id), {
        total_marks: Number(row.total_marks ?? 0),
        question_count: Number(row.question_count ?? 0),
      });
    }

    const enrichedRows = rows.map((row) => {
      const tid = Number(row.id);
      const presentation = presentationByTestId.get(tid);
      const attempts = attemptsByTestId.get(tid);
      const marks = marksByTestId.get(tid);
      return {
        ...row,
        total_marks: marks?.total_marks ?? 0,
        question_count: marks?.question_count ?? 0,
        attempts_used: attempts?.attempts_used ?? 0,
        active_attempt_id: attempts?.active_attempt_id ?? null,
        subject_label: presentation?.displayLabel ?? null,
        subject_ids: presentation?.subjectIds ?? [],
      };
    });

    const statusCounts = { available: 0, in_progress: 0, completed: 0 };
    for (const row of enrichedRows) {
      const { status } = computeStudentTestListingStatus({
        maxAttempts: row.max_attempts,
        attemptsUsed: row.attempts_used,
        activeAttemptId: row.active_attempt_id,
        allowRetake: Boolean(Number(row.allow_retake ?? 0)),
      });
      statusCounts[status] += 1;
    }

    logger.info('student test listing resolved', {
      studentId: uid,
      page,
      limit,
      total,
      returned: enrichedRows.length,
      statusCounts,
    });

    return toStudentTestListResponse(enrichedRows, { page, limit, total });
  } catch (error) {
    logger.error('student test listing failed', {
      studentId: uid,
      page,
      limit,
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? 'unknown_error',
    });
    throw new ApiError(500, 'Unable to load tests', { code: 'STUDENT_TEST_LIST_FAILED' });
  }
}
