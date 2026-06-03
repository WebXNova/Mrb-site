/**
 * Question bank service-layer domain errors.
 */

import { AppError } from '../base/AppError.js';
import {
  INTERNAL_ERROR,
  INVALID_QUESTION_ID,
  QUESTION_NOT_FOUND,
} from '../codes/ErrorCodes.js';

/** @typedef {Record<string, unknown>} ErrorMetadata */

export class InvalidQuestionIdError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Question id must be a positive integer.',
      errorCode: INVALID_QUESTION_ID,
      httpStatus: 400,
      isOperational: true,
      metadata,
    });
  }
}

export class QuestionNotFoundError extends AppError {
  /** @param {ErrorMetadata|null} [metadata] */
  constructor(metadata = null) {
    super({
      message: 'Question was not found or is no longer available.',
      errorCode: QUESTION_NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class QuestionBankInternalError extends AppError {
  /**
   * @param {ErrorMetadata|null} [metadata]
   * @param {Error|null} [cause]
   */
  constructor(metadata = null, cause = null) {
    super({
      message: 'An unexpected error occurred while processing the question.',
      errorCode: INTERNAL_ERROR,
      httpStatus: 500,
      isOperational: false,
      metadata,
      cause,
    });
  }
}
