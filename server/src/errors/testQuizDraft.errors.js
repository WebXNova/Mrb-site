import { AppError } from './base/AppError.js';
import { DRAFT_VERSION_CONFLICT, FORBIDDEN, QUIZ_DRAFT_NOT_FOUND } from './codes/ErrorCodes.js';

export class QuizDraftNotFoundError extends AppError {
  constructor(testId) {
    super({
      message: 'No quiz draft exists for this test.',
      errorCode: QUIZ_DRAFT_NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }
}

export class QuizDraftVersionConflictError extends AppError {
  /**
   * @param {number} testId
   * @param {{
   *   expectedVersion: number|null,
   *   currentVersion: number,
   *   draft?: object | null,
   *   conflictKind?: 'missing_expected_version'|'stale_version'|'concurrent_update',
   * }} details
   */
  constructor(testId, { expectedVersion, currentVersion, draft = null, conflictKind = null }) {
    const lastModified =
      draft && typeof draft === 'object' && typeof draft.lastModified === 'string'
        ? draft.lastModified
        : draft && typeof draft === 'object' && typeof draft.updatedAt === 'string'
          ? draft.updatedAt
          : null;

    const resolvedKind =
      conflictKind ||
      (expectedVersion == null
        ? 'missing_expected_version'
        : Number(expectedVersion) !== Number(currentVersion)
          ? 'stale_version'
          : 'concurrent_update');

    super({
      message: 'Quiz draft was modified by another session. Reload and retry.',
      errorCode: DRAFT_VERSION_CONFLICT,
      httpStatus: 409,
      isOperational: true,
      metadata: {
        testId: Number(testId),
        expectedVersion,
        currentVersion,
        lastModified,
        conflictKind: resolvedKind,
        draft,
      },
    });
  }
}

export class QuizDraftOwnershipError extends AppError {
  constructor(testId, { draftId, createdBy, userId }) {
    super({
      message: 'You do not have permission to modify this quiz draft.',
      errorCode: FORBIDDEN,
      httpStatus: 403,
      isOperational: true,
      metadata: {
        testId: Number(testId),
        draftId,
        createdBy,
        userId,
      },
    });
  }
}
