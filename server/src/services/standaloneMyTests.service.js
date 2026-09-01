/**
 * Authenticated student's standalone My Results (free + paid completed attempts).
 * Course-linked tests are excluded — those stay on /api/student/test-history.
 * Identity comes from the authenticated session, never from a client-provided user id.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';
import { loadTestSubjectPresentationBatch } from './testSubjectPresentation.service.js';
import { STANDALONE_TEST_JOIN_SQL } from '../constants/testAccessType.constants.js';
import {
  buildStandaloneMyTestsFilterClauses,
  clampPageSize,
  mapStandaloneMyTestItem,
  normalizeAccessTypeFilter,
  normalizeStatusFilter,
} from './standaloneMyTests.presentation.js';

const FROM_SQL = `
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id
    AND ${STANDALONE_TEST_JOIN_SQL}
    AND t.deleted_at IS NULL
  LEFT JOIN test_results r ON r.attempt_id = a.id
  LEFT JOIN (
    SELECT test_id, user_id, MIN(blocked_at) AS blocked_at
    FROM test_integrity_blocks
    GROUP BY test_id, user_id
  ) tib ON tib.test_id = t.id AND tib.user_id = ?
  WHERE (a.user_id = ? OR a.student_id = ?)
    AND a.status IN ('in_progress', 'submitted', 'expired')
`;

function parseStudentId(studentId) {
  const uid = Number(studentId);
  if (!Number.isInteger(uid) || uid <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return uid;
}

/**
 * @param {number} studentId
 * @param {{
 *   page?: number,
 *   pageSize?: number,
 *   search?: string,
 *   accessType?: string,
 *   status?: string,
 * }} query
 */
export async function listStandaloneMyTests(studentId, query = {}) {
  const uid = parseStudentId(studentId);
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = clampPageSize(query.pageSize);
  const offset = (page - 1) * pageSize;
  const accessType = normalizeAccessTypeFilter(query.accessType);
  const status = normalizeStatusFilter(query.status);
  const { extraWhere, params: filterParams } = buildStandaloneMyTestsFilterClauses({
    search: query.search,
    accessType,
    status,
  });

  const ownerParams = [uid, uid, uid];
  const listParams = [...ownerParams, ...filterParams];

  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS total ${FROM_SQL}${extraWhere}`,
    listParams
  );
  const totalItems = Number(countRows[0]?.total ?? 0);
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

  const [itemRows] = await mysqlPool.query(
    `SELECT
       a.id AS attempt_id,
       a.test_id,
       a.status AS attempt_status,
       a.started_at,
       a.submitted_at,
       a.completion_reason,
       a.is_flagged_cheating,
       a.time_taken_seconds AS attempt_time_taken_seconds,
       t.title AS test_title,
       t.public_slug,
       t.test_access_type,
       t.results_released_at,
       t.show_result_immediately,
       r.score,
       r.max_score,
       r.percentage,
       r.correct_count,
       r.wrong_count,
       r.time_taken_seconds AS result_time_taken_seconds,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status,
       tib.blocked_at AS integrity_blocked_at
     ${FROM_SQL}${extraWhere}
     ORDER BY COALESCE(a.submitted_at, a.started_at, a.id) DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...listParams, pageSize, offset]
  );

  const [typeCountRows] = await mysqlPool.query(
    `SELECT t.test_access_type AS access_type, COUNT(*) AS total
     ${FROM_SQL}${extraWhere}
     GROUP BY t.test_access_type`,
    listParams
  );
  const totals = { free: 0, paid: 0 };
  for (const row of typeCountRows) {
    const count = Number(row.total || 0);
    if (row.access_type === 'free_standalone') totals.free = count;
    if (row.access_type === 'paid_standalone') totals.paid = count;
  }

  const presentationByTestId = await loadTestSubjectPresentationBatch(
    itemRows.map((row) => Number(row.test_id))
  );

  return {
    items: itemRows.map((row) => mapStandaloneMyTestItem(row, presentationByTestId)),
    totals,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
