/**
 * Single publish eligibility engine — the ONLY authority for publish decisions.
 *
 * Depends on: valid subjects, valid active composed questions, wizard completeness.
 * No other service may independently gate publishing.
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import {
  INVALID_TEST_COMPOSITION,
  INVALID_TEST_STATE,
  NOT_FOUND,
  NO_SUBJECTS,
  PUBLISH_REQUIREMENTS_NOT_MET,
  TEST_IS_LOCKED,
} from '../errors/codes/ErrorCodes.js';
import {
  evaluateTestCompleteness,
  isPublishedDbStatus,
  loadTestCompletenessRow,
  TEST_LIFECYCLE_STATES,
} from './testCompleteness.service.js';
import { countActiveComposedQuestionsForTest } from './testQuestionComposition.service.js';
import { loadTestSubjectIds } from './testSubjectValidation.service.js';
import {
  buildValidationReport,
  evaluateSubjectAndLinkComposition,
  loadTestValidationRow,
  validateTestState,
} from './testValidation.service.js';
import {
  logTestValidationFailure,
  TEST_SECURITY_ACTIONS,
} from './testSecurityAudit.service.js';

export const PUBLISH_ELIGIBILITY_CODES = Object.freeze({
  NO_QUESTIONS: 'NO_QUESTIONS',
});

/**
 * Publish-time error normalization: subject/composition issues surface as INVALID_TEST_COMPOSITION.
 * @param {string[]} errors
 */
export function normalizePublishEligibilityErrors(errors) {
  return [...new Set(errors.map((code) => (code === NO_SUBJECTS ? INVALID_TEST_COMPOSITION : code)))];
}

/**
 * @param {string[]} errors
 */
function primaryPublishErrorCode(errors) {
  const normalized = normalizePublishEligibilityErrors(errors);
  if (normalized.includes(PUBLISH_ELIGIBILITY_CODES.NO_QUESTIONS)) return PUBLISH_ELIGIBILITY_CODES.NO_QUESTIONS;
  if (normalized.includes(INVALID_TEST_COMPOSITION)) return INVALID_TEST_COMPOSITION;
  if (normalized.includes(INVALID_TEST_STATE)) return INVALID_TEST_STATE;
  if (normalized.includes(PUBLISH_REQUIREMENTS_NOT_MET)) return PUBLISH_REQUIREMENTS_NOT_MET;
  return PUBLISH_REQUIREMENTS_NOT_MET;
}

/**
 * @param {import('./testValidation.service.js').ValidationReport} report
 */
export function throwPublishEligibilityFailure(report, auditContext = {}) {
  const errors = normalizePublishEligibilityErrors(report.errors);
  const code = primaryPublishErrorCode(errors);
  const testId = auditContext.testId ?? report.testId ?? null;

  logTestValidationFailure({
    testId: testId != null ? Number(testId) : null,
    userId: auditContext.userId ?? null,
    errorCode: code,
    errors,
    reason: auditContext.reason || 'PUBLISH_ELIGIBILITY_FAILED',
    action: TEST_SECURITY_ACTIONS.PUBLISH_FAILED,
    metadata: { missing_fields: report.missing_fields },
  });

  const httpStatus =
    code === TEST_IS_LOCKED ? 409 : code === INVALID_TEST_COMPOSITION ? 422 : 400;

  throw new AppError({
    message: publishMessageForCode(code),
    errorCode: code,
    httpStatus,
    isOperational: true,
    metadata: { ...report, errors },
  });
}

/**
 * @param {string} code
 */
function publishMessageForCode(code) {
  const messages = {
    [PUBLISH_ELIGIBILITY_CODES.NO_QUESTIONS]: 'Test must have at least one active linked question.',
    [INVALID_TEST_COMPOSITION]: 'Test composition is invalid for publishing.',
    [INVALID_TEST_STATE]: 'Test state is invalid for publishing.',
    [PUBLISH_REQUIREMENTS_NOT_MET]: 'Test does not meet publish requirements.',
    [TEST_IS_LOCKED]: 'Test is already published.',
  };
  return messages[code] || 'Test cannot be published.';
}

/**
 * Evaluate publish eligibility from live DB truth (non-throwing).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function evaluatePublishEligibility(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const row = await loadTestValidationRow(tid, executor);

  if (!row) {
    return buildValidationReport(false, [INVALID_TEST_STATE], { testId: tid, notFound: true });
  }

  if (isPublishedDbStatus(row.status)) {
    return buildValidationReport(false, [TEST_IS_LOCKED], { testId: tid, status: row.status });
  }

  const errors = [];
  const stateReport = validateTestState(row);
  if (!stateReport.valid) errors.push(...stateReport.errors);

  const compositionReport = await evaluateSubjectAndLinkComposition(tid, row, executor);
  if (!compositionReport.valid) {
    errors.push(...compositionReport.errors);
  }

  const activeQuestionCount = await countActiveComposedQuestionsForTest(tid, executor);
  const subjectIds = await loadTestSubjectIds(tid, executor);
  const completenessRow = await loadTestCompletenessRow(tid, executor);
  const wizardReport = evaluateTestCompleteness(
    completenessRow || row,
    activeQuestionCount,
    'publish',
    subjectIds
  );

  if (!wizardReport.step1_complete) errors.push(PUBLISH_REQUIREMENTS_NOT_MET);
  if (!wizardReport.step2_complete) errors.push(PUBLISH_REQUIREMENTS_NOT_MET);
  if (!wizardReport.step3_complete) errors.push(PUBLISH_REQUIREMENTS_NOT_MET);
  if (!wizardReport.step4_complete || activeQuestionCount < 1) {
    errors.push(PUBLISH_ELIGIBILITY_CODES.NO_QUESTIONS);
  }

  if (wizardReport.lifecycle_status !== TEST_LIFECYCLE_STATES.READY_FOR_PUBLISH) {
    errors.push(PUBLISH_REQUIREMENTS_NOT_MET);
  }

  const normalizedErrors = normalizePublishEligibilityErrors(errors);

  return buildValidationReport(normalizedErrors.length === 0, normalizedErrors, {
    testId: tid,
    state: stateReport,
    composition: compositionReport,
    wizard: wizardReport,
    active_question_count: activeQuestionCount,
    lifecycle_status: wizardReport.lifecycle_status,
    can_publish: normalizedErrors.length === 0,
    missing_fields: wizardReport.missing_fields,
  });
}

/**
 * Sole publish gate — throws on any failed check.
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ throwOnFailure?: boolean, userId?: number|null }} [options]
 */
export async function validatePublishEligibility(testId, executor = mysqlPool, options = {}) {
  const throwOnFailure = options.throwOnFailure !== false;
  const tid = Number(testId);
  const report = await evaluatePublishEligibility(tid, executor);

  if (report.notFound) {
    if (throwOnFailure) {
      throw new AppError({
        message: 'Test was not found.',
        errorCode: NOT_FOUND,
        httpStatus: 404,
        isOperational: true,
        metadata: { testId: tid },
      });
    }
    return null;
  }

  if (throwOnFailure && !report.valid) {
    throwPublishEligibilityFailure(report, { testId: tid, userId: options.userId });
  }

  return report;
}
