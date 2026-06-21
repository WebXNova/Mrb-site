import { AppError } from '../../errors/base/AppError.js';
import { VALIDATION_ERROR } from '../../errors/codes/ErrorCodes.js';

/**
 * Operational MCQ validation failure with structured issue list.
 */
export class McqValidationError extends AppError {
  /**
   * @param {Array<{ code: string, message: string, field?: string, optionIndex?: number }>} issues
   * @param {{ context?: string, pathPrefix?: string, questionId?: number|null }} [meta]
   */
  constructor(issues, meta = {}) {
    const list = Array.isArray(issues) && issues.length ? issues : [{ code: VALIDATION_ERROR, message: 'MCQ validation failed.' }];
    const primary = list[0];
    super({
      message: primary.message,
      errorCode: primary.code || VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: {
        issues: list,
        issueCount: list.length,
        ...meta,
      },
    });
    this.issues = list;
  }
}
