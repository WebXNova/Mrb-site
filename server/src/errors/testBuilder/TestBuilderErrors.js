import { AppError } from '../base/AppError.js';
import {
  ACCESS_DENIED,
  CONFLICT,
  NOT_FOUND,
  VALIDATION_ERROR,
} from '../codes/ErrorCodes.js';

export class TestNotFoundError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class TestQuestionLinkDuplicateError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'This question is already linked to the test.',
      errorCode: CONFLICT,
      httpStatus: 409,
      isOperational: true,
      metadata,
    });
  }
}

export class TestQuestionNotLinkedError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Question is not linked to this test.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata,
    });
  }
}

export class TestCourseScopeError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Question and test must belong to the same course.',
      errorCode: ACCESS_DENIED,
      httpStatus: 403,
      isOperational: true,
      metadata,
    });
  }
}

export class TestQuestionReorderInvalidError extends AppError {
  constructor(message, metadata = null) {
    super({
      message: message || 'Invalid test question reorder payload.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata,
    });
  }
}

export class TestMissingCourseError extends AppError {
  constructor(metadata = null) {
    super({
      message: 'Test must be assigned to a course before linking questions.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata,
    });
  }
}

export class TestQuestionIdsInvalidError extends AppError {
  constructor(invalidIds, metadata = null) {
    super({
      message: 'One or more question IDs are invalid or not available for this test course.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { invalidIds, ...(metadata || {}) },
    });
  }
}

export class TestQuestionBulkLimitError extends AppError {
  constructor(message, metadata = null) {
    super({
      message: message || 'Too many questions in bulk request.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata,
    });
  }
}

export class TestQuestionUnlinkInvalidError extends AppError {
  constructor(notLinkedIds, metadata = null) {
    super({
      message: 'One or more questions are not linked to this test.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { notLinkedIds, ...(metadata || {}) },
    });
  }
}
