/**
 * Central validation authority for the Test System — single source of truth.
 *
 * validateTestState        — structural integrity of a test row / create payload
 * validateTestComposition — subjects + linked-question subject alignment
 * Publish eligibility: testPublishEligibility.service.js
 */

import { mysqlPool } from '../config/mysql.js';
import { findLinkedMcqsWithoutOptions } from './testQuestionComposition.service.js';
import { buildTestPublishSummary } from './testPublishSummary.service.js';
import { AppError } from '../errors/base/AppError.js';
import {
  INVALID_CATEGORY,
  INVALID_TEST_COMPOSITION,
  INVALID_TEST_STATE,
  INVALID_TEST_TYPE,
  NOT_FOUND,
  NO_SUBJECTS,
  PUBLISH_REQUIREMENTS_NOT_MET,
  QUESTION_SUBJECT_NOT_ALLOWED,
  TEST_IS_LOCKED,
} from '../errors/codes/ErrorCodes.js';
import {
  DEFAULT_TEST_CATEGORY,
  TEST_CATEGORY_VALUES,
  TEST_DB_STATUS_VALUES,
  TEST_TYPE_VALUES,
} from '../constants/testMetadata.constants.js';
import {
  parseStrictTestCategory,
  parseStrictTestDbStatus,
  parseStrictTestType,
} from '../validators/testEnumGuards.js';
import {
  evaluateTestCompleteness,
  isPublishedDbStatus,
  loadTestCompletenessRow,
} from './testCompleteness.service.js';
import { getCourseSubjectIds, loadTestSubjectIds } from './testSubjectValidation.service.js';
import {
  logTestValidationFailure,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';
import { assertTestUnpublished, enforceUnpublishedTest } from './publishedTestLock.service.js';

export const TEST_VALIDATION_CODES = Object.freeze({
  INVALID_TEST_STATE,
  NO_SUBJECTS,
  INVALID_TEST_COMPOSITION,
  PUBLISH_REQUIREMENTS_NOT_MET,
  INVALID_CATEGORY,
  INVALID_TEST_TYPE,
  NO_QUESTIONS: 'NO_QUESTIONS',
  TEST_IS_LOCKED,
});

const SUPPORTED_TEST_TYPES = new Set(TEST_TYPE_VALUES);
const SUPPORTED_CATEGORIES = new Set(TEST_CATEGORY_VALUES);
const SUPPORTED_DB_STATUSES = new Set(TEST_DB_STATUS_VALUES);

/**
 * @typedef {object} ValidationReport
 * @property {boolean} valid
 * @property {string[]} errors
 * @property {Record<string, unknown>} [details]
 */

/**
 * @param {boolean} valid
 * @param {string[]} errors
 * @param {Record<string, unknown>} [details]
 * @returns {ValidationReport}
 */
export function buildValidationReport(valid, errors = [], details = {}) {
  return {
    valid,
    errors: [...new Set(errors.filter(Boolean))],
    ...details,
  };
}

/**
 * @param {ValidationReport} report
 * @param {string} [primaryCode]
 * @param {{ testId?: number|null, userId?: number|null, reason?: string, action?: string }} [auditContext]
 */
export function throwFromValidationReport(report, primaryCode = INVALID_TEST_STATE, auditContext = {}) {
  const code = report.errors[0] || primaryCode;
  const testId =
    auditContext.testId ??
    report.details?.testId ??
    report.testId ??
    null;

  logTestValidationFailure({
    testId: testId != null ? Number(testId) : null,
    userId: auditContext.userId ?? null,
    errorCode: code,
    errors: report.errors,
    reason: auditContext.reason,
    action: auditContext.action || TEST_SECURITY_ACTIONS.VALIDATION_FAILURE,
  });

  const httpStatus =
    code === TEST_IS_LOCKED
      ? 409
      : code === QUESTION_SUBJECT_NOT_ALLOWED
        ? 403
        : code === PUBLISH_REQUIREMENTS_NOT_MET
          ? 400
          : 422;

  throw new AppError({
    message: humanMessageForCode(code),
    errorCode: code,
    httpStatus,
    isOperational: true,
    metadata: { errors: report.errors, ...(report.details || {}) },
  });
}

/**
 * @param {string} code
 */
function humanMessageForCode(code) {
  const messages = {
    [INVALID_TEST_STATE]: 'Test state is invalid.',
    [NO_SUBJECTS]: 'Test must have at least one subject mapping.',
    [INVALID_TEST_COMPOSITION]: 'Test composition is invalid.',
    [PUBLISH_REQUIREMENTS_NOT_MET]: 'Test does not meet publish requirements.',
    [INVALID_CATEGORY]: 'Test category must be MDCAT.',
    [INVALID_TEST_TYPE]: 'Test type is invalid.',
    [TEST_VALIDATION_CODES.NO_QUESTIONS]: 'Test must have at least one linked question.',
    [TEST_IS_LOCKED]: 'Published tests cannot be modified.',
    [QUESTION_SUBJECT_NOT_ALLOWED]: 'Question subject is not allowed for this test.',
  };
  return messages[code] || 'Test validation failed.';
}

/**
 * Structural integrity of a test record (sync).
 * @param {Record<string, unknown>} testRow
 * @returns {ValidationReport}
 */
export function validateTestState(testRow) {
  const errors = [];

  const courseId = Number(testRow.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    errors.push(INVALID_TEST_STATE);
  }

  let testType = '';
  let category = '';
  try {
    testType = parseStrictTestType(testRow.test_type) ?? '';
  } catch {
    errors.push(INVALID_TEST_TYPE);
  }

  try {
    category = parseStrictTestCategory(testRow.category);
  } catch {
    errors.push(INVALID_CATEGORY);
  }

  if (!SUPPORTED_TEST_TYPES.has(testType) && !errors.includes(INVALID_TEST_TYPE)) {
    errors.push(INVALID_TEST_TYPE);
  }
  if (!SUPPORTED_CATEGORIES.has(category) && !errors.includes(INVALID_CATEGORY)) {
    errors.push(INVALID_CATEGORY);
  }

  if (testRow.status != null && testRow.status !== '') {
    try {
      parseStrictTestDbStatus(testRow.status);
    } catch {
      errors.push(INVALID_TEST_STATE);
    }
  }

  const title = String(testRow.title ?? '').trim();
  if (title.length < 3) {
    errors.push(INVALID_TEST_STATE);
  }

  return buildValidationReport(errors.length === 0, errors, {
    courseId,
    testType,
    category,
  });
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function loadTestValidationRow(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT id, course_id, title, category, test_type, duration_minutes, max_attempts, passing_marks,
            access_mode, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  return rows[0] ?? null;
}

/**
 * @param {Record<string, unknown>} testRow
 */
export function enforceEditableTest(testRow) {
  assertTestUnpublished(testRow, {
    testId: Number(testRow?.id),
    reason: 'PUBLISHED_TEST_WIZARD_MUTATION',
    action: TEST_SECURITY_ACTIONS.PUBLISHED_TEST_EDIT_ATTEMPT,
  });
}

/**
 * @param {number} testId
 * @param {Record<string, unknown>} testRow
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
export async function evaluateSubjectAndLinkComposition(testId, testRow, executor) {
  const errors = [];
  const tid = Number(testId);
  const testType = String(testRow.test_type ?? '').trim();
  const courseId = Number(testRow.course_id);

  const subjectIds = await loadTestSubjectIds(tid, executor);

  if (!subjectIds.length) {
    errors.push(NO_SUBJECTS);
    return buildValidationReport(false, errors, { subjectIds, testType, courseId });
  }

  if (testType === 'subject_wise' && subjectIds.length !== 1) {
    errors.push(INVALID_TEST_COMPOSITION);
  }

  if (testType === 'mixed_subject' && subjectIds.length < 1) {
    errors.push(NO_SUBJECTS);
  }

  const courseSubjects = await getCourseSubjectIds(courseId, executor);
  const courseSet = new Set(courseSubjects);
  const invalidSubjects = subjectIds.filter((id) => !courseSet.has(id));
  if (invalidSubjects.length) {
    errors.push(INVALID_TEST_COMPOSITION);
  }

  const allowedSubjectIdSet = new Set(subjectIds);
  const [linkRows] = await executor.query(
    `SELECT tq.question_id, qb.subject_id
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?`,
    [tid]
  );

  const violations = [];
  for (const row of linkRows) {
    const questionId = Number(row.question_id);
    const subjectId = row.subject_id == null ? null : Number(row.subject_id);
    if (!subjectId || !allowedSubjectIdSet.has(subjectId)) {
      violations.push({ questionId, subjectId });
    }
  }

  if (violations.length) {
    errors.push(INVALID_TEST_COMPOSITION);
  }

  const mcqsMissingOptions = await findLinkedMcqsWithoutOptions(tid, executor);
  if (mcqsMissingOptions.length) {
    errors.push(INVALID_TEST_COMPOSITION);
  }

  return buildValidationReport(errors.length === 0, errors, {
    testId: tid,
    courseId,
    testType,
    subjectIds,
    allowedSubjectIdSet,
    subjectContext: {
      testId: tid,
      courseId,
      testType,
      subjectIds,
      allowedSubjectIdSet,
    },
    linkedQuestionCount: linkRows.length,
    violations,
    mcqsMissingOptions,
  });
}

/**
 * Composition validity: subjects + linked question subject rules.
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ throwOnFailure?: boolean }} [options]
 */
export async function validateTestComposition(testId, executor = mysqlPool, options = {}) {
  const row = await loadTestValidationRow(testId, executor);
  if (!row) {
    const report = buildValidationReport(false, [INVALID_TEST_STATE], { testId: Number(testId) });
    if (options.throwOnFailure) throwFromValidationReport(report, NOT_FOUND);
    return report;
  }

  const stateReport = validateTestState(row);
  if (!stateReport.valid) {
    if (options.throwOnFailure) throwFromValidationReport(stateReport);
    return stateReport;
  }

  const compositionReport = await evaluateSubjectAndLinkComposition(testId, row, executor);
  const merged = buildValidationReport(compositionReport.valid, compositionReport.errors, {
    state: stateReport,
    ...compositionReport,
  });

  if (options.throwOnFailure && !merged.valid) {
    throwFromValidationReport(merged, INVALID_TEST_COMPOSITION);
  }

  return merged;
}

/**
 * @param {import('./testSubjectIntegrity.service.js').TestSubjectContext} ctx
 * @param {number|null|undefined} questionSubjectId
 * @param {number} [questionId]
 */
export function assertQuestionSubjectIdAllowed(ctx, questionSubjectId, questionId = null) {
  const sid = questionSubjectId == null ? null : Number(questionSubjectId);
  if (!sid || !ctx.allowedSubjectIdSet.has(sid)) {
    logTestValidationFailure({
      testId: ctx.testId,
      errorCode: QUESTION_SUBJECT_NOT_ALLOWED,
      reason: 'INVALID_SUBJECT_INJECTION',
      action: TEST_SECURITY_ACTIONS.INVALID_SUBJECT_INJECTION,
      metadata: {
        questionId: questionId != null ? Number(questionId) : null,
        questionSubjectId: sid,
        allowedSubjectIds: [...ctx.allowedSubjectIdSet],
        testType: ctx.testType,
      },
    });
    throw new AppError({
      message: 'Question subject is not allowed for this test configuration.',
      errorCode: QUESTION_SUBJECT_NOT_ALLOWED,
      httpStatus: 403,
      isOperational: true,
      metadata: {
        testId: ctx.testId,
        testType: ctx.testType,
        questionId: questionId != null ? Number(questionId) : null,
        questionSubjectId: sid,
        allowedSubjectIds: [...ctx.allowedSubjectIdSet],
      },
    });
  }
}

/**
 * Preconditions for wizard writes (rules, settings, basic-info).
 * @param {number} testId
 * @param {'basic'|'rules'|'settings'} step
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function enforceWizardWrite(testId, step, executor = mysqlPool, options = {}) {
  const row = await loadTestValidationRow(testId, executor);
  if (!row) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  if (!options.allowPublishedEdit) {
    enforceEditableTest(row);
  }
  const stateReport = validateTestState(row);
  if (!stateReport.valid) throwFromValidationReport(stateReport);

  const subjectIds = await loadTestSubjectIds(testId, executor);
  const wizardReport = evaluateTestCompleteness(row, 0, 'general', subjectIds);

  if (step === 'rules' || step === 'settings') {
    if (!wizardReport.step1_complete) {
      throwFromValidationReport(
        buildValidationReport(false, [PUBLISH_REQUIREMENTS_NOT_MET], {
          missing_fields: wizardReport.missing_fields,
          step: 'step1',
        }),
        PUBLISH_REQUIREMENTS_NOT_MET
      );
    }
  }

  if (step === 'settings' && !wizardReport.step2_complete) {
    throwFromValidationReport(
      buildValidationReport(false, [PUBLISH_REQUIREMENTS_NOT_MET], {
        missing_fields: wizardReport.missing_fields,
        step: 'step2',
      }),
      PUBLISH_REQUIREMENTS_NOT_MET
    );
  }

  return { row, wizardReport };
}

/**
 * Preconditions for question linking / available list / reorder.
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function enforceQuestionMutationPreconditions(testId, executor = mysqlPool, options = {}) {
  if (!options.allowPublishedEdit) {
    await enforceUnpublishedTest(testId, executor, {
      reason: 'PUBLISHED_TEST_QUESTION_MUTATION',
      action: TEST_SECURITY_ACTIONS.QUESTION_LINKING_REJECTION,
    });
  }

  const compositionReport = await validateTestComposition(testId, executor, { throwOnFailure: true });
  return compositionReport.subjectContext;
}

/**
 * Validate create payload before INSERT (Step 1).
 * @param {{ course_id: number, title: string, category?: string, test_type: string, status?: string }} payload
 */
export function validateTestStateForCreate(payload) {
  const report = validateTestState({
    course_id: payload.course_id,
    title: payload.title,
    category: payload.category || DEFAULT_TEST_CATEGORY,
    test_type: payload.test_type,
    status: payload.status ?? 'INCOMPLETE',
    duration_minutes: 0,
    max_attempts: 0,
    access_mode: 'private',
  });

  if (!report.valid) throwFromValidationReport(report);
  return report;
}

/**
 * Merged validation report for completeness API / wizard UI.
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function getFullTestValidationReport(testId, executor = mysqlPool) {
  const row = await loadTestCompletenessRow(testId, executor);
  if (!row) return null;

  const stateReport = validateTestState(row);
  const compositionReport = await validateTestComposition(testId, executor);
  const { evaluatePublishEligibility } = await import('./testPublishEligibility.service.js');
  const publishReport = await evaluatePublishEligibility(testId, executor);
  const questionCount =
    publishReport.effective_question_count ??
    publishReport.question_authority?.questionCount ??
    publishReport.active_question_count ??
    0;

  const errors = [...new Set([...stateReport.errors, ...compositionReport.errors, ...publishReport.errors])];
  const publish_summary = await buildTestPublishSummary(testId, executor);

  return {
    ...publishReport.wizard,
    question_count: questionCount,
    publish_summary,
    question_authority_source: publishReport.question_authority?.source ?? publishReport.wizard?.question_authority_source ?? null,
    valid: publishReport.valid && stateReport.valid,
    errors,
    validation: {
      state: stateReport,
      composition: compositionReport,
      publish: publishReport,
    },
    can_publish: publishReport.can_publish === true,
  };
}
