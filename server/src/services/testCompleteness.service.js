/**
 * Test completeness engine — single source of truth for wizard + publish gates.
 */

import { AppError } from '../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { mysqlPool } from '../config/mysql.js';
import { loadTestSubjectIds } from './testSubjectValidation.service.js';
import { countActiveComposedQuestionsForTest } from './testQuestionComposition.service.js';

export const TEST_LIFECYCLE_STATES = Object.freeze({
  INCOMPLETE: 'INCOMPLETE',
  DRAFT: 'DRAFT',
  READY_FOR_PUBLISH: 'READY_FOR_PUBLISH',
  PUBLISHED: 'PUBLISHED',
});

export const COMPLETENESS_ERROR_CODES = Object.freeze({
  COURSE_REQUIRED: 'COURSE_REQUIRED',
  TITLE_INVALID: 'TITLE_INVALID',
  TEST_TYPE_REQUIRED: 'TEST_TYPE_REQUIRED',
  DURATION_REQUIRED: 'DURATION_REQUIRED',
  MAX_ATTEMPTS_REQUIRED: 'MAX_ATTEMPTS_REQUIRED',
  ACCESS_MODE_REQUIRED: 'ACCESS_MODE_REQUIRED',
  CANNOT_PUBLISH_INCOMPLETE_RULES: 'CANNOT_PUBLISH_INCOMPLETE_RULES',
  NO_QUESTIONS_ADDED: 'NO_QUESTIONS_ADDED',
  TEST_NOT_COMPLETE: 'TEST_NOT_COMPLETE',
});

import { TEST_DB_STATUS_VALUES, TEST_TYPE_VALUES } from '../constants/testMetadata.constants.js';
import { parseStrictTestDbStatus } from '../validators/testEnumGuards.js';

export { TEST_DB_STATUS_VALUES };

const STEP1_TYPES = new Set(TEST_TYPE_VALUES);

/**
 * @param {string|null|undefined} status
 */
export function isPublishedDbStatus(status) {
  return String(status || '').trim().toLowerCase() === 'published';
}

/**
 * @param {string} lifecycleStatus
 */
export function mapLifecycleStatusToDb(lifecycleStatus) {
  if (lifecycleStatus === TEST_LIFECYCLE_STATES.PUBLISHED) return 'published';
  return lifecycleStatus;
}

/**
 * @param {string} dbOrLifecycleStatus
 */
export function isPublishDbStatusValue(dbOrLifecycleStatus) {
  const normalized = String(dbOrLifecycleStatus || '').trim().toLowerCase();
  return normalized === 'published' || normalized === TEST_LIFECYCLE_STATES.PUBLISHED.toLowerCase();
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {number[]} subjectIds
 * @param {string[]} missingFields
 */
function evaluateStep1(testRow, subjectIds, missingFields) {
  const courseId = Number(testRow.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    missingFields.push('course_id');
    return false;
  }

  const title = String(testRow.title ?? '').trim();
  if (title.length < 3) {
    missingFields.push('title');
    return false;
  }

  const testType = String(testRow.test_type ?? '').trim();
  if (!testType || !STEP1_TYPES.has(testType)) {
    missingFields.push('test_type');
    return false;
  }

  const category = String(testRow.category ?? '').trim();
  if (!category) {
    missingFields.push('category');
    return false;
  }

  const ids = subjectIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
  if (testType === 'subject_wise') {
    if (ids.length !== 1) {
      missingFields.push('subject_id');
      return false;
    }
  } else if (testType === 'mixed_subject' && ids.length < 1) {
    missingFields.push('subject_ids');
    return false;
  }

  return true;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {string[]} missingFields
 */
function evaluateStep2(testRow, missingFields) {
  const duration = Number(testRow.duration_minutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600) {
    missingFields.push('duration_minutes');
    return false;
  }

  const maxAttempts = Number(testRow.max_attempts);
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0 || maxAttempts > 50) {
    missingFields.push('max_attempts');
    return false;
  }

  return true;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {string[]} missingFields
 */
function evaluateStep3(testRow, missingFields) {
  const accessMode = String(testRow.access_mode ?? '').trim().toLowerCase();
  if (accessMode !== 'public' && accessMode !== 'private') {
    missingFields.push('access_mode');
    return false;
  }
  return true;
}

/**
 * @param {Record<string, unknown>} testRow
 * @param {number} questionCount
 * @param {'general'|'publish'} [context]
 */
export function evaluateTestCompleteness(testRow, questionCount = 0, context = 'general', subjectIds = []) {
  const missingFields = [];
  const step1_complete = evaluateStep1(testRow, subjectIds, missingFields);
  const step2_complete = evaluateStep2(testRow, missingFields);
  const step3_complete = evaluateStep3(testRow, missingFields);
  const step4_complete = Number(questionCount) >= 1;

  if (context === 'publish' && !step4_complete) {
    missingFields.push('questions');
  }

  const uniqueMissing = [...new Set(missingFields)];
  const can_publish = step1_complete && step2_complete && step3_complete && step4_complete;

  let lifecycle_status = TEST_LIFECYCLE_STATES.INCOMPLETE;
  if (isPublishedDbStatus(testRow.status)) {
    lifecycle_status = TEST_LIFECYCLE_STATES.PUBLISHED;
  } else if (step1_complete && step2_complete && step3_complete && step4_complete) {
    lifecycle_status = TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH;
  } else if (step1_complete && step2_complete && step3_complete) {
    lifecycle_status = TEST_LIFECYCLE_STATES.DRAFT;
  } else {
    lifecycle_status = TEST_LIFECYCLE_STATES.INCOMPLETE;
  }

  return {
    step1_complete,
    step2_complete,
    step3_complete,
    step4_complete,
    can_publish,
    missing_fields: uniqueMissing,
    lifecycle_status,
    question_count: Number(questionCount) || 0,
  };
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestCompletenessRow(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT id, course_id, title, category, test_type, duration_minutes, max_attempts, access_mode, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
/** Raw junction row count (includes orphan/deleted links). Not used for publish gates. */
export async function countLinkedQuestionsForTest(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(`SELECT COUNT(*) AS total FROM test_questions WHERE test_id = ?`, [tid]);
  return Number(rows[0]?.total ?? 0);
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function getTestCompletenessReport(testId, executor = mysqlPool) {
  const row = await loadTestCompletenessRow(testId, executor);
  if (!row) return null;
  const questionCount = await countActiveComposedQuestionsForTest(testId, executor);
  const subjectIds = await loadTestSubjectIds(testId, executor);
  return evaluateTestCompleteness(row, questionCount, 'general', subjectIds);
}

/**
 * Recompute lifecycle status from DB truth and persist (never auto-publish).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function syncTestLifecycleStatus(testId, executor = mysqlPool) {
  const row = await loadTestCompletenessRow(testId, executor);
  if (!row) return null;

  const subjectIds = await loadTestSubjectIds(testId, executor);

  if (isPublishedDbStatus(row.status)) {
    const questionCount = await countActiveComposedQuestionsForTest(testId, executor);
    return evaluateTestCompleteness(row, questionCount, 'general', subjectIds);
  }

  const questionCount = await countActiveComposedQuestionsForTest(testId, executor);
  const report = evaluateTestCompleteness(row, questionCount, 'general', subjectIds);
  const dbStatus = parseStrictTestDbStatus(mapLifecycleStatusToDb(report.lifecycle_status));

  await executor.query(`UPDATE tests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`, [
    dbStatus,
    Number(testId),
  ]);

  return report;
}

