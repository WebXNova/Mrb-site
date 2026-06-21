import { AppError } from '../errors/base/AppError.js';
import {
  INVALID_MCQ_FOR_PUBLISH,
  NOT_FOUND,
  PUBLISH_REQUIREMENTS_NOT_MET,
  QUIZ_DRAFT_NOT_FOUND,
} from '../errors/codes/ErrorCodes.js';

export const QUIZ_DRAFT_MATERIALIZATION_CODES = Object.freeze({
  NO_DRAFT: 'QUIZ_DRAFT_NOT_FOUND',
  NO_QUESTIONS: 'QUIZ_DRAFT_NO_QUESTIONS',
  TEST_NOT_FOUND: 'TEST_NOT_FOUND',
  TEST_ALREADY_PUBLISHED: 'TEST_ALREADY_PUBLISHED',
  MATERIALIZATION_FAILED: 'QUIZ_DRAFT_MATERIALIZATION_FAILED',
  DUPLICATE_MATERIALIZATION: 'QUIZ_DRAFT_DUPLICATE_MATERIALIZATION',
});

export class QuizDraftMaterializationError extends AppError {
  /**
   * @param {string} message
   * @param {string} errorCode
   * @param {Record<string, unknown>} [metadata]
   */
  constructor(message, errorCode, metadata = {}) {
    super({
      message,
      errorCode,
      httpStatus: errorCode === NOT_FOUND || errorCode === QUIZ_DRAFT_NOT_FOUND ? 404 : 422,
      isOperational: true,
      metadata,
    });
  }
}

export function draftNotFoundError(testId) {
  return new QuizDraftMaterializationError(
    'No active quiz draft exists for this test.',
    QUIZ_DRAFT_NOT_FOUND,
    { testId: Number(testId) }
  );
}

export function draftHasNoQuestionsError(testId, draftId) {
  return new QuizDraftMaterializationError(
    'Quiz draft must contain at least one question before publish.',
    PUBLISH_REQUIREMENTS_NOT_MET,
    { testId: Number(testId), draftId, code: QUIZ_DRAFT_MATERIALIZATION_CODES.NO_QUESTIONS }
  );
}

export function materializationFailedError(testId, reason, metadata = {}) {
  return new QuizDraftMaterializationError(
    reason || 'Quiz draft could not be materialized.',
    QUIZ_DRAFT_MATERIALIZATION_CODES.MATERIALIZATION_FAILED,
    { testId: Number(testId), ...metadata }
  );
}

export function duplicateMaterializationError(testId, draftVersion) {
  return new QuizDraftMaterializationError(
    'Draft questions were already materialized for this version.',
    QUIZ_DRAFT_MATERIALIZATION_CODES.DUPLICATE_MATERIALIZATION,
    { testId: Number(testId), draftVersion }
  );
}

export function invalidMcqMaterializationError(testId, issues) {
  return new QuizDraftMaterializationError(
    'One or more draft MCQ questions are invalid and cannot be published.',
    INVALID_MCQ_FOR_PUBLISH,
    { testId: Number(testId), issues }
  );
}
