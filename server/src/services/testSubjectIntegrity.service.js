/**
 * @deprecated Use testValidation.service.js — thin re-exports for legacy imports.
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { QUESTION_SUBJECT_NOT_ALLOWED, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import {
  assertQuestionSubjectIdAllowed,
  enforceQuestionMutationPreconditions,
  throwFromValidationReport,
  validateTestComposition,
} from './testValidation.service.js';

export { assertQuestionSubjectIdAllowed };

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function validateTestSubjectIntegrity(testId, executor = mysqlPool) {
  const report = await validateTestComposition(testId, executor);
  if (!report.valid) throwFromValidationReport(report, report.errors[0]);
  return report.subjectContext;
}

/** @deprecated Use validateTestComposition */
export const validateLinkedQuestionsSubjectComposition = validateTestSubjectIntegrity;

/**
 * @param {number} testId
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function assertQuestionSubjectAllowedForTest(testId, questionId, executor = mysqlPool) {
  const ctx = await enforceQuestionMutationPreconditions(testId, executor);
  const qid = Number(questionId);
  const [rows] = await executor.query(
    `SELECT id, subject_id, course_id, deleted_at FROM question_bank WHERE id = ? LIMIT 1`,
    [qid]
  );
  const row = rows[0];
  if (!row || row.deleted_at != null) {
    throw new AppError({
      message: 'Question was not found.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 404,
      isOperational: true,
      metadata: { questionId: qid },
    });
  }
  if (Number(row.course_id) !== ctx.courseId) {
    throw new AppError({
      message: 'Question and test must belong to the same course.',
      errorCode: QUESTION_SUBJECT_NOT_ALLOWED,
      httpStatus: 403,
      isOperational: true,
      metadata: { testId: ctx.testId, questionId: qid },
    });
  }
  assertQuestionSubjectIdAllowed(ctx, row.subject_id, qid);
  return ctx;
}
