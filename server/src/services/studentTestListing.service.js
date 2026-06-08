/**
 * Student test listing — eligible published tests for owned courses (Phase 1C + 1D status).
 *
 * Attempt status is derived from a single aggregated JOIN (no N+1).
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { StructuredLogger } from '../utils/requestId.js';
import { toStudentTestListResponse } from '../dto/studentTestList.dto.js';
import {
  COUNT_STUDENT_ELIGIBLE_TESTS_SQL,
  LIST_STUDENT_ELIGIBLE_TESTS_SQL,
  buildStudentEligibleTestsBaseParams,
  buildListStudentEligibleTestsParams,
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

    const statusCounts = { available: 0, in_progress: 0, completed: 0 };
    for (const row of rows) {
      const { status } = computeStudentTestListingStatus({
        maxAttempts: row.max_attempts,
        attemptsUsed: row.attempts_used,
        activeAttemptId: row.active_attempt_id,
      });
      statusCounts[status] += 1;
    }

    logger.info('student test listing resolved', {
      studentId: uid,
      page,
      limit,
      total,
      returned: rows.length,
      statusCounts,
    });

    return toStudentTestListResponse(rows, { page, limit, total });
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
