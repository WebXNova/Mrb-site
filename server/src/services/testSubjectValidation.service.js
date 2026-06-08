/**
 * Course-scoped subject validation for tests (subject_wise | mixed_subject).
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';

import { DEFAULT_TEST_CATEGORY, TEST_TYPE_VALUES } from '../constants/testMetadata.constants.js';

export { DEFAULT_TEST_CATEGORY, TEST_TYPE_VALUES };

export const TEST_SUBJECT_ERROR_CODES = Object.freeze({
  INVALID_SUBJECT_FOR_COURSE: 'INVALID_SUBJECT_FOR_COURSE',
  SUBJECT_ID_REQUIRED: 'SUBJECT_ID_REQUIRED',
  SUBJECT_IDS_REQUIRED: 'SUBJECT_IDS_REQUIRED',
  SUBJECT_WISE_SINGLE_ONLY: 'SUBJECT_WISE_SINGLE_ONLY',
});

/**
 * @param {number} courseId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function getCourseSubjectIds(courseId, executor = mysqlPool) {
  const cid = Number(courseId);
  const [rows] = await executor.query(
    `SELECT id FROM subjects WHERE course_id = ? AND is_active = TRUE ORDER BY order_index ASC, id ASC`,
    [cid]
  );
  return rows.map((row) => Number(row.id));
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestSubjectIds(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT subject_id FROM test_subjects WHERE test_id = ? ORDER BY subject_id ASC`,
    [tid]
  );
  return rows.map((row) => Number(row.subject_id));
}

/**
 * @param {string} testType
 * @param {Record<string, unknown>} payload
 */
export function normalizeSubjectIdsFromPayload(testType, payload) {
  const type = String(testType || '').trim();

  if (type === 'subject_wise') {
    const subjectId = Number(payload.subject_id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) return [];
    return [subjectId];
  }

  if (type === 'mixed_subject') {
    const raw = payload.subject_ids;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  }

  return [];
}

/**
 * @param {number} courseId
 * @param {string} testType
 * @param {number[]} subjectIds
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function validateSubjectsForTest(courseId, testType, subjectIds, executor = mysqlPool) {
  const type = String(testType || '').trim();
  const ids = [...new Set(subjectIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];

  if (type === 'subject_wise') {
    if (ids.length !== 1) {
      throw new AppError({
        message: 'subject_wise tests require exactly one subject_id from the course.',
        errorCode: TEST_SUBJECT_ERROR_CODES.SUBJECT_ID_REQUIRED,
        httpStatus: 422,
        isOperational: true,
      });
    }
  } else if (type === 'mixed_subject') {
    if (!ids.length) {
      throw new AppError({
        message: 'mixed_subject tests require at least one subject_id from the course.',
        errorCode: TEST_SUBJECT_ERROR_CODES.SUBJECT_IDS_REQUIRED,
        httpStatus: 422,
        isOperational: true,
      });
    }
  } else {
    throw new AppError({
      message: 'Invalid test_type.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
    });
  }

  const allowed = await getCourseSubjectIds(courseId, executor);
  const allowedSet = new Set(allowed);
  const invalid = ids.filter((id) => !allowedSet.has(id));
  if (invalid.length) {
    throw new AppError({
      message: 'One or more subjects do not belong to this course.',
      errorCode: TEST_SUBJECT_ERROR_CODES.INVALID_SUBJECT_FOR_COURSE,
      httpStatus: 422,
      isOperational: true,
      metadata: { invalidSubjectIds: invalid, courseId: Number(courseId) },
    });
  }

  return ids;
}

/**
 * @param {number} testId
 * @param {number[]} subjectIds
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} connection
 */
export async function replaceTestSubjects(testId, subjectIds, connection) {
  const tid = Number(testId);
  await connection.query(`DELETE FROM test_subjects WHERE test_id = ?`, [tid]);
  if (!subjectIds.length) return;

  const values = subjectIds.map((subjectId) => [tid, Number(subjectId)]);
  await connection.query(`INSERT INTO test_subjects (test_id, subject_id) VALUES ?`, [values]);
}

