import { mysqlPool } from '../config/mysql.js';
import { QuizDraftNotFoundError } from '../errors/testQuizDraft.errors.js';
import { AppError } from '../errors/base/AppError.js';
import { UNAUTHORIZED } from '../errors/codes/ErrorCodes.js';
import { VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import {
  findTestQuizDraftByTestId,
  findTestQuizDraftByTestIdForRead,
  insertTestQuizDraft,
  restoreSoftDeletedTestQuizDraft,
  softDeleteTestQuizDraftByTestId,
  updateTestQuizDraftWithVersion,
} from '../repositories/testQuizDraft.repository.js';
import { logActivity } from './activityLog.service.js';
import { assertQuizDraftAccess } from './testQuizDraftAccess.service.js';
import { syncTestLifecycleStatus } from './testCompleteness.service.js';
import { enforceQuestionMutationPreconditions } from './testValidation.service.js';
import {
  auditPublishedTestEdit,
  buildPublishedEditMetadata,
  resolvePublishedEditContext,
} from './publishedTestEdit.service.js';
import {
  rematerializePublishedTestFromDraft,
} from './testQuizDraftMaterialization.service.js';
import {
  parseUpsertTestQuizDraftBody,
  validateAndSanitizeQuizDraftPayload,
} from './testQuizDraftValidation.service.js';
import { raiseDraftVersionConflict, toPublicDraft } from './testQuizDraftConcurrency.js';

/**
 * @param {number} userId
 */
function assertAuthenticatedUser(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new AppError({
      message: 'Authenticated admin is required.',
      errorCode: UNAUTHORIZED,
      httpStatus: 401,
      isOperational: true,
    });
  }
}

/**
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 */
export async function getTestQuizDraft(testId, userId, role) {
  assertAuthenticatedUser(userId);
  await assertQuizDraftAccess(testId, userId, role, 'read');

  const draft = await findTestQuizDraftByTestIdForRead(mysqlPool, testId);
  return {
    testId: Number(testId),
    draft: toPublicDraft(draft),
  };
}

/**
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {unknown} rawBody
 */
export async function upsertTestQuizDraft(testId, userId, role, rawBody) {
  assertAuthenticatedUser(userId);
  await assertQuizDraftAccess(testId, userId, role, 'write');

  const body = parseUpsertTestQuizDraftBody(rawBody);
  const publishContext = await resolvePublishedEditContext(testId, {
    confirmPublishedEdit: body.confirm_published_edit === true,
    expectedUpdatedAt: body.expected_updated_at ?? null,
  });

  const sanitizedPayload = validateAndSanitizeQuizDraftPayload(testId, body.draftPayload);

  if (publishContext.isPublished && sanitizedPayload.questions.length < 1) {
    throw new AppError({
      message: 'Published tests must keep at least one question.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { testId: Number(testId) },
    });
  }

  const connection = await mysqlPool.getConnection();
  let savedDraft = null;
  let action = 'admin.test.quiz_draft.create';
  /** @type {Awaited<ReturnType<typeof rematerializePublishedTestFromDraft>>|null} */
  let rematerializationSummary = null;

  try {
    await connection.beginTransaction();
    await enforceQuestionMutationPreconditions(testId, connection, {
      allowPublishedEdit: publishContext.isPublished,
    });

    const existing = await findTestQuizDraftByTestId(connection, testId);

    if (!existing || existing.deletedAt) {
      if (existing?.deletedAt) {
        savedDraft = await restoreSoftDeletedTestQuizDraft(connection, {
          testId,
          draftPayload: sanitizedPayload,
          createdBy: userId,
        });
        if (!savedDraft) {
          savedDraft = await insertTestQuizDraft(connection, {
            testId,
            draftPayload: sanitizedPayload,
            createdBy: userId,
          });
        }
        action = 'admin.test.quiz_draft.restore';
      } else {
        savedDraft = await insertTestQuizDraft(connection, {
          testId,
          draftPayload: sanitizedPayload,
          createdBy: userId,
        });
      }
    } else {
      if (body.expectedVersion == null) {
        await raiseDraftVersionConflict(testId, userId, role, {
          expectedVersion: null,
          currentVersion: existing.version,
          draft: toPublicDraft(existing),
          conflictKind: 'missing_expected_version',
        });
      }

      if (Number(body.expectedVersion) !== Number(existing.version)) {
        await raiseDraftVersionConflict(testId, userId, role, {
          expectedVersion: Number(body.expectedVersion),
          currentVersion: existing.version,
          draft: toPublicDraft(existing),
          conflictKind: 'stale_version',
        });
      }

      const { updated, row } = await updateTestQuizDraftWithVersion(connection, {
        testId,
        draftPayload: sanitizedPayload,
        expectedVersion: Number(body.expectedVersion),
      });

      if (!updated || !row) {
        const current = await findTestQuizDraftByTestId(connection, testId);
        await raiseDraftVersionConflict(testId, userId, role, {
          expectedVersion: Number(body.expectedVersion),
          currentVersion: current?.version ?? existing.version,
          draft: toPublicDraft(current),
          conflictKind: 'concurrent_update',
        });
      }

      savedDraft = row;
      action = 'admin.test.quiz_draft.update';
    }

    if (!savedDraft) {
      throw new AppError({
        message: 'Quiz draft could not be saved.',
        errorCode: 'INTERNAL_ERROR',
        httpStatus: 500,
        isOperational: false,
        metadata: { testId: Number(testId) },
      });
    }

    if (publishContext.isPublished) {
      rematerializationSummary = await rematerializePublishedTestFromDraft(testId, userId, connection);
      await connection.query(
        `UPDATE tests SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`,
        [Number(testId)]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await syncTestLifecycleStatus(testId);

  if (publishContext.isPublished) {
    await auditPublishedTestEdit({
      testId: Number(testId),
      userId,
      role,
      section: 'questions',
      metadata: {
        questionCount: sanitizedPayload.questions.length,
        attemptStats: publishContext.attemptStats,
        rematerialized: Boolean(rematerializationSummary),
      },
    });
  }

  await logActivity({
    userId,
    role,
    action,
    entityType: 'test_quiz_draft',
    entityId: String(savedDraft.draftId),
    metadata: {
      testId: Number(testId),
      version: savedDraft.version,
      questionCount: sanitizedPayload.questions.length,
      totalPoints: sanitizedPayload.totalPoints,
      savedAt: sanitizedPayload.savedAt,
      createdBy: savedDraft.createdBy,
      restored: action === 'admin.test.quiz_draft.restore',
    },
  });

  return {
    testId: Number(testId),
    draft: toPublicDraft(savedDraft),
    rematerialization: rematerializationSummary,
    ...buildPublishedEditMetadata(publishContext.attemptStats),
  };
}

/**
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 */
export async function deleteTestQuizDraft(testId, userId, role) {
  assertAuthenticatedUser(userId);
  await assertQuizDraftAccess(testId, userId, role, 'delete');

  const connection = await mysqlPool.getConnection();
  let removedDraft = null;

  try {
    await connection.beginTransaction();
    await enforceQuestionMutationPreconditions(testId, connection);

    const existing = await findTestQuizDraftByTestId(connection, testId);
    if (!existing || existing.deletedAt) {
      throw new QuizDraftNotFoundError(testId);
    }

    removedDraft = existing;
    const removed = await softDeleteTestQuizDraftByTestId(connection, testId, userId);
    if (!removed) {
      throw new QuizDraftNotFoundError(testId);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await syncTestLifecycleStatus(testId);

  await logActivity({
    userId,
    role,
    action: 'admin.test.quiz_draft.delete',
    entityType: 'test_quiz_draft',
    entityId: String(removedDraft.draftId),
    metadata: {
      testId: Number(testId),
      version: removedDraft.version,
      createdBy: removedDraft.createdBy,
      softDeleted: true,
    },
  });

  return {
    testId: Number(testId),
    deleted: true,
  };
}
