import { QuizDraftVersionConflictError } from '../errors/testQuizDraft.errors.js';
import { logActivity } from './activityLog.service.js';

/**
 * @param {ReturnType<typeof import('../repositories/testQuizDraft.repository.js').mapTestQuizDraftRow>} draft
 */
export function toPublicDraft(draft) {
  if (!draft || draft.deletedAt) return null;

  const lastModified =
    draft.updatedAt instanceof Date
      ? draft.updatedAt.toISOString()
      : typeof draft.updatedAt === 'string'
        ? draft.updatedAt
        : null;

  return {
    draftId: draft.draftId,
    testId: draft.testId,
    draftPayload: draft.draftPayload,
    version: draft.version,
    lastModified,
    createdBy: draft.createdBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

/**
 * @param {number} testId
 * @param {number} userId
 * @param {string} role
 * @param {{
 *   expectedVersion: number|null,
 *   currentVersion: number,
 *   draft?: ReturnType<typeof toPublicDraft>,
 *   conflictKind?: 'missing_expected_version'|'stale_version'|'concurrent_update',
 * }} details
 */
export async function raiseDraftVersionConflict(testId, userId, role, details) {
  const publicDraft = details.draft ?? null;
  const conflictKind =
    details.conflictKind ||
    (details.expectedVersion == null
      ? 'missing_expected_version'
      : Number(details.expectedVersion) !== Number(details.currentVersion)
        ? 'stale_version'
        : 'concurrent_update');

  await logActivity({
    userId,
    role,
    action: 'admin.test.quiz_draft.version_conflict',
    entityType: 'test_quiz_draft',
    entityId: publicDraft?.draftId != null ? String(publicDraft.draftId) : String(testId),
    metadata: {
      testId: Number(testId),
      expectedVersion: details.expectedVersion,
      currentVersion: details.currentVersion,
      lastModified: publicDraft?.lastModified ?? null,
      conflictKind,
      draftId: publicDraft?.draftId ?? null,
      questionCount: Array.isArray(publicDraft?.draftPayload?.questions)
        ? publicDraft.draftPayload.questions.length
        : null,
    },
  });

  throw new QuizDraftVersionConflictError(testId, {
    expectedVersion: details.expectedVersion,
    currentVersion: details.currentVersion,
    draft: publicDraft,
    conflictKind,
  });
}
