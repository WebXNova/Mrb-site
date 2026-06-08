/**
 * Entitlement-scoped student test history — read-only, server-computed aggregates.
 */

import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import { resolveActiveEntitlement, assertEntitlementGrantable } from './entitlement.service.js';
import { EnrollmentNotFoundError } from '../errors/entitlement/EntitlementErrors.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function clampPageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

function normalizeStatusFilter(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (raw === 'pass') return 'PASS';
  if (raw === 'fail') return 'FAIL';
  return null;
}

/**
 * @param {number} studentId
 */
async function requireEntitlement(studentId) {
  const entitlement = await resolveActiveEntitlement(studentId);
  if (!entitlement) {
    throw new EnrollmentNotFoundError({ userId: studentId, context: 'student_test_history' });
  }
  assertEntitlementGrantable(entitlement, { userId: studentId, courseId: entitlement.courseId });
  return entitlement;
}

function buildFilterClauses({ search, statusFilter }) {
  const clauses = [];
  const params = [];

  const term = String(search || '').trim();
  if (term) {
    clauses.push(`t.title LIKE ?`);
    params.push(`%${term}%`);
  }

  if (statusFilter === 'PASS' || statusFilter === 'FAIL') {
    clauses.push(`(${DERIVED_PASS_STATUS_SQL}) = ?`);
    params.push(statusFilter);
    clauses.push(`t.show_result_immediately = 1`);
  }

  const extraWhere = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  return { extraWhere, params };
}

const HISTORY_FROM_SQL = `
  FROM test_attempts a
  INNER JOIN test_results r ON r.attempt_id = a.id
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
  WHERE a.user_id = ?
    AND a.status = 'submitted'`;

/**
 * @param {number} studentId
 * @param {{ page?: number, pageSize?: number, search?: string, status?: string }} query
 */
export async function getStudentTestHistory(studentId, query = {}) {
  const entitlement = await requireEntitlement(studentId);
  const courseId = entitlement.courseId;
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = clampPageSize(query.pageSize);
  const offset = (page - 1) * pageSize;
  const statusFilter = normalizeStatusFilter(query.status);
  const { extraWhere, params: filterParams } = buildFilterClauses({
    search: query.search,
    statusFilter,
  });

  const db = scopedQuery({ courseId, context: 'studentTestHistory.list', userId: studentId });
  const listParams = [courseId, studentId, ...filterParams];

  const countRow = await db.first(
    `SELECT COUNT(*) AS total ${HISTORY_FROM_SQL}${extraWhere}`,
    listParams
  );
  const totalItems = Number(countRow?.total ?? 0);
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

  const itemRows = await db.rows(
    `SELECT
       a.id AS attempt_id,
       a.test_id,
       a.submitted_at,
       t.title AS test_title,
       t.public_slug,
       t.show_result_immediately,
       r.score,
       r.max_score,
       r.percentage,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status
     ${HISTORY_FROM_SQL}${extraWhere}
     ORDER BY a.submitted_at DESC, a.id DESC
     LIMIT ? OFFSET ?`,
    [...listParams, pageSize, offset]
  );

  const statsRow = await db.first(
    `SELECT
       COUNT(*) AS total_tests,
       SUM(CASE WHEN (${DERIVED_PASS_STATUS_SQL}) = 'PASS' THEN 1 ELSE 0 END) AS passed_tests,
       SUM(CASE WHEN (${DERIVED_PASS_STATUS_SQL}) = 'FAIL' THEN 1 ELSE 0 END) AS failed_tests,
       AVG(r.percentage) AS average_percentage
     ${HISTORY_FROM_SQL}
       AND t.show_result_immediately = 1`,
    [courseId, studentId]
  );

  return {
    items: itemRows.map((row) => {
      const resultVisible = Boolean(Number(row.show_result_immediately));
      return {
        attemptId: Number(row.attempt_id),
        testId: Number(row.test_id),
        testTitle: String(row.test_title ?? ''),
        slug: row.public_slug ?? null,
        submittedAt: row.submitted_at == null ? null : String(row.submitted_at),
        resultAvailable: resultVisible,
        score: resultVisible ? Number(row.score ?? 0) : null,
        maxScore: resultVisible && row.max_score != null ? Number(row.max_score) : null,
        percentage: resultVisible ? Number(row.percentage ?? 0) : null,
        status: resultVisible ? String(row.pass_status ?? '') : null,
      };
    }),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
    statistics: {
      totalTests: Number(statsRow?.total_tests ?? 0),
      passedTests: Number(statsRow?.passed_tests ?? 0),
      failedTests: Number(statsRow?.failed_tests ?? 0),
      averagePercentage:
        statsRow?.average_percentage == null
          ? null
          : Math.round(Number(statsRow.average_percentage) * 100) / 100,
    },
  };
}
