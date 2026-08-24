/**
 * Quiz Draft → Published Question Materialization
 *
 * TRANSACTION FLOW (called inside publishTest transaction):
 *   1. Lock test row + active draft row (FOR UPDATE)
 *   2. Validate draft exists with MCQ-valid questions
 *   3. Idempotency check (materialized_version === draft.version + link count)
 *   4. Snapshot prior test_questions.question_id values (superseded candidates)
 *   5. DELETE existing test_questions links (replace strategy)
 *   6. For each draft question:
 *        INSERT question_bank → INSERT question_options → INSERT test_questions
 *   7. Soft-delete superseded question_bank rows (unlinked + no student_answers)
 *   8. assertPersistedQuestionIntegrity per question
 *   9. UPDATE test_quiz_drafts.materialized_version
 *
 * ROLLBACK: any failure rolls back entire publish transaction — no partial runtime rows.
 */

import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import { MCQ_OPTION_KEY_ALPHABET } from '../validation/mcq/mcqValidation.constants.js';
import { validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { validateQuestionMarks } from '../validators/questionMarks.validation.js';
import { findTestQuizDraftByTestId } from '../repositories/testQuizDraft.repository.js';
import { invalidateTestTotalMarksCache } from './testTotalMarks.service.js';
import {
  assertTestQuestionLinkNotDuplicate,
  clearTestQuestionLinks,
  clearTestSections,
  countTestQuestionLinks,
  insertMaterializedQuestionBankRow,
  insertMaterializedQuestionOptions,
  insertTestQuestionLink,
  insertTestSection,
  loadPrimaryTestSubjectId,
  loadTestPublishScopeRow,
  markDraftMaterialized,
} from '../repositories/testQuizDraftMaterialization.repository.js';
import {
  snapshotSupersededQuestionIds,
  softDeleteSupersededMaterializedQuestions,
} from './materializedQuestionCleanup.service.js';
import { assertPersistedQuestionIntegrity } from './questionBankIntegrity.service.js';
import { isPublishedDbStatus } from './testCompleteness.service.js';
import {
  collectInvalidSectionLabels,
  resolveDraftSectionSubject,
} from './quizDraftSectionValidation.service.js';
import { loadTestSubjectPresentation } from './testSubjectPresentation.service.js';
import { isQuizDraftSection, filterQuizDraftQuestions } from '../utils/quizDraftItems.js';
import { TEST_IS_LOCKED, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { MAX_QUESTIONS_PER_TEST } from '../validators/testQuestionLimits.schema.js';
import { QUIZ_DRAFT_MIN_POINTS } from '../validators/testQuizDraft.schema.js';
import { sanitizeQuestionHtml } from '../utils/questionHtmlSanitizer.js';
import {
  draftHasNoQuestionsError,
  draftNotFoundError,
  invalidMcqMaterializationError,
  materializationFailedError,
  QuizDraftMaterializationError,
} from '../errors/testQuizDraftMaterialization.errors.js';
import { logActivity } from './activityLog.service.js';
import { logSecurityEvent, TEST_SECURITY_ACTIONS } from './testSecurityAudit.service.js';

const LOG_PREFIX = '[quiz-draft:materialize]';

/**
 * @param {unknown} draftQuestion
 * @param {number} index
 */
function validateDraftQuestionForMaterialization(draftQuestion, index) {
  const result = validateMcqQuizDraftQuestion(draftQuestion, index, { context: 'publish' });
  if (result.skipped) {
    throw materializationFailedError(null, `Question type "${draftQuestion?.questionType}" is not supported for publish.`, {
      questionIndex: index,
      questionType: draftQuestion?.questionType,
    });
  }
  if (!result.valid) {
    throw new McqValidationError(result.errors, {
      context: 'publish',
      pathPrefix: `questions[${index}]`,
    });
  }
  return result.normalized;
}

/**
 * @param {object} normalized
 * @param {number} index
 */
function mapNormalizedDraftToBankOptions(normalized, index) {
  return normalized.choices.map((choice, choiceIndex) => ({
    option_key: MCQ_OPTION_KEY_ALPHABET[choiceIndex] ?? String.fromCharCode(65 + choiceIndex),
    option_text: choice.text,
    image_url: choice.imageUrl ?? null,
    is_correct: Boolean(choice.isCorrect),
    sort_order: choiceIndex,
  }));
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 * @param {number} userId
 * @param {{ allowIdempotentSkip?: boolean, replaceExistingLinks?: boolean }} [options]
 */
export async function materializeQuizDraftToRuntimeTables(
  testId,
  userId,
  connection,
  options = {}
) {
  const tid = Number(testId);
  const replaceExistingLinks = options.replaceExistingLinks !== false;
  const allowIdempotentSkip = options.allowIdempotentSkip !== false;

  const testRow = await loadTestPublishScopeRow(connection, tid);
  if (!testRow) {
    throw new QuizDraftMaterializationError('Test was not found.', 'TEST_NOT_FOUND', { testId: tid });
  }

  const published = isPublishedDbStatus(testRow.status);
  const allowPublishedRematerialization = options.allowPublishedRematerialization === true;

  if (published && !allowPublishedRematerialization) {
    throw new QuizDraftMaterializationError(
      'Test is already published.',
      TEST_IS_LOCKED,
      { testId: tid, status: testRow.status }
    );
  }

  if (!published && allowPublishedRematerialization) {
    throw new QuizDraftMaterializationError(
      'Only published tests can be rematerialized in place.',
      VALIDATION_ERROR,
      { testId: tid, status: testRow.status }
    );
  }

  const courseId = Number(testRow.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw materializationFailedError(tid, 'Test must belong to a course before materialization.');
  }

  const draft = await findTestQuizDraftByTestId(connection, tid);
  if (!draft || draft.deletedAt) {
    throw draftNotFoundError(tid);
  }

  const draftItems = Array.isArray(draft.draftPayload?.questions) ? draft.draftPayload.questions : [];
  const draftQuestions = filterQuizDraftQuestions(draftItems);
  if (!draftQuestions.length) {
    throw draftHasNoQuestionsError(tid, draft.draftId);
  }
  if (draftQuestions.length > MAX_QUESTIONS_PER_TEST) {
    throw materializationFailedError(tid, `Draft exceeds maximum of ${MAX_QUESTIONS_PER_TEST} questions.`, {
      questionCount: draftQuestions.length,
      max: MAX_QUESTIONS_PER_TEST,
    });
  }

  const presentation = await loadTestSubjectPresentation(tid, connection);
  const subjects = (presentation.subjectIds || []).map((id, index) => ({
    id,
    title: presentation.subjectTitles?.[index] ?? '',
  }));
  const invalidSections = collectInvalidSectionLabels(draft.draftPayload, subjects);
  if (invalidSections.length) {
    throw invalidMcqMaterializationError(tid, [
      {
        code: 'SECTION_SUBJECT_REQUIRED',
        message: subjects.length
          ? 'Every section marker must have a subject selected from this test before publish.'
          : 'Add at least one subject in Settings, then choose a subject for each section.',
        field: `questions[${invalidSections[0].index}].subjectId`,
      },
    ]);
  }

  const linkedBefore = await countTestQuestionLinks(connection, tid);
  const materializedVersion = draft.materializedVersion ?? null;
  if (
    allowIdempotentSkip &&
    materializedVersion != null &&
    Number(materializedVersion) === Number(draft.version) &&
    linkedBefore === draftQuestions.length
  ) {
    console.info(`${LOG_PREFIX} idempotent skip`, { testId: tid, draftVersion: draft.version });
    return {
      testId: tid,
      draftId: draft.draftId,
      draftVersion: draft.version,
      idempotent: true,
      skipped: true,
      questionCount: linkedBefore,
      questionIds: [],
      replacedLinks: 0,
    };
  }

  /** @type {Array<{ draftQuestionId: string, questionBankId: number, displayOrder: number }>} */
  const materialized = [];
  /** @type {import('../validation/mcq/mcqValidation.engine.js').McqValidationIssue[]} */
  const validationIssues = [];

  for (const [index, draftItem] of draftItems.entries()) {
    if (isQuizDraftSection(draftItem)) continue;
    try {
      validateDraftQuestionForMaterialization(draftItem, index);
    } catch (error) {
      if (error instanceof McqValidationError) {
        validationIssues.push(...error.issues);
        continue;
      }
      throw error;
    }
  }

  if (validationIssues.length) {
    throw invalidMcqMaterializationError(tid, validationIssues);
  }

  const subjectId = await loadPrimaryTestSubjectId(connection, tid);
  const createdBy = Number.isInteger(userId) && userId > 0 ? userId : Number(draft.createdBy);

  const supersededQuestionIds =
    replaceExistingLinks && linkedBefore > 0
      ? await snapshotSupersededQuestionIds(connection, tid)
      : [];

  let replacedLinks = 0;
  if (replaceExistingLinks && linkedBefore > 0) {
    replacedLinks = await clearTestQuestionLinks(connection, tid);
  }
  await clearTestSections(connection, tid);

  let sectionDisplayOrder = 0;
  let questionDisplayOrder = 0;
  /** @type {number|null} */
  let activeSectionId = null;

  for (const [index, draftItem] of draftItems.entries()) {
    if (isQuizDraftSection(draftItem)) {
      const resolved = resolveDraftSectionSubject(draftItem, subjects);
      const subjectLabel = String(resolved?.title || draftItem.subjectLabel || '').trim();
      const dividerHtml = sanitizeQuestionHtml(
        String(draftItem.dividerContentHtml ?? draftItem.dividerContentHtml ?? '')
      ).trim();
      activeSectionId = await insertTestSection(connection, {
        testId: tid,
        displayOrder: sectionDisplayOrder,
        subjectLabel,
        subjectId: resolved?.id ?? null,
        dividerContentHtml: dividerHtml || null,
      });
      sectionDisplayOrder += 1;
      continue;
    }

    const normalized = validateDraftQuestionForMaterialization(draftItem, index);
    const bankOptions = mapNormalizedDraftToBankOptions(normalized, index);

    const marksResult = validateQuestionMarks(draftItem.points, {
      defaultWhenMissing: true,
      field: `questions[${index}].points`,
    });
    if (!marksResult.ok) {
      throw invalidMcqMaterializationError(tid, [
        {
          code: 'INVALID_QUESTION_MARKS',
          message: `Question ${questionDisplayOrder + 1}: ${marksResult.message}`,
          field: `questions[${index}].points`,
        },
      ]);
    }
    const marks = marksResult.marks;

    const sanitizedExplanation = sanitizeQuestionHtml(String(draftItem.explanation ?? '')).trim();
    const sanitizedTip =
      draftItem.showTip && String(draftItem.tip ?? '').trim()
        ? sanitizeQuestionHtml(String(draftItem.tip ?? '')).trim()
        : null;

    const questionBankId = await insertMaterializedQuestionBankRow(connection, {
      courseId,
      subjectId,
      questionText: normalized.questionText,
      questionHtml: normalized.questionText,
      questionImageUrl: normalized.questionImageUrl ?? null,
      explanation: sanitizedExplanation || null,
      explanationHtml: sanitizedExplanation || null,
      tipHtml: sanitizedTip,
      marks,
      createdBy,
    });

    if (!Number.isFinite(questionBankId) || questionBankId <= 0) {
      throw materializationFailedError(tid, 'question_bank insert did not return a valid id.', {
        questionIndex: index,
      });
    }

    await insertMaterializedQuestionOptions(connection, questionBankId, bankOptions);
    await assertPersistedQuestionIntegrity(connection, questionBankId);

    const isDuplicate = await assertTestQuestionLinkNotDuplicate(connection, tid, questionBankId);
    if (isDuplicate) {
      throw materializationFailedError(tid, 'Duplicate test_questions link detected during materialization.', {
        questionBankId,
        questionIndex: index,
      });
    }

    await insertTestQuestionLink(connection, {
      testId: tid,
      questionId: questionBankId,
      displayOrder: questionDisplayOrder,
      sectionId: activeSectionId,
      marksOverride: marks,
    });

    materialized.push({
      draftQuestionId: String(draftItem.id),
      questionBankId,
      displayOrder: questionDisplayOrder,
    });
    questionDisplayOrder += 1;
  }

  const supersededCleanup = await softDeleteSupersededMaterializedQuestions(connection, {
    supersededQuestionIds,
    deletedByUserId: createdBy,
  });

  await markDraftMaterialized(connection, draft.draftId, draft.version);

  invalidateTestTotalMarksCache(tid);

  const summary = {
    testId: tid,
    draftId: draft.draftId,
    draftVersion: draft.version,
    idempotent: false,
    skipped: false,
    questionCount: materialized.length,
    questionIds: materialized.map((row) => row.questionBankId),
    replacedLinks,
    supersededCleanup,
    materialized,
  };

  console.info(`${LOG_PREFIX} completed`, {
    testId: tid,
    draftId: draft.draftId,
    questionCount: summary.questionCount,
    replacedLinks,
    supersededDeleted: supersededCleanup.deletedCount,
    supersededSkipped: supersededCleanup.skippedCount,
  });

  return summary;
}

/**
 * Replace runtime question links for a published test from the current quiz draft.
 *
 * @param {number} testId
 * @param {number} userId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
export async function rematerializePublishedTestFromDraft(testId, userId, connection) {
  return materializeQuizDraftToRuntimeTables(testId, userId, connection, {
    allowPublishedRematerialization: true,
    allowIdempotentSkip: false,
    replaceExistingLinks: true,
  });
}

/**
 * Audit hook — call after successful publish commit.
 *
 * @param {number} testId
 * @param {number|null} userId
 * @param {Awaited<ReturnType<typeof materializeQuizDraftToRuntimeTables>>} summary
 */
export async function auditQuizDraftMaterialization(testId, userId, summary) {
  await logActivity({
    userId,
    role: 'admin',
    action: summary.skipped
      ? 'admin.test.quiz_draft.materialize_skipped'
      : 'admin.test.quiz_draft.materialized',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      testId: Number(testId),
      draftId: summary.draftId,
      draftVersion: summary.draftVersion,
      questionCount: summary.questionCount,
      questionIds: summary.questionIds,
      idempotent: summary.idempotent,
      replacedLinks: summary.replacedLinks,
    },
  });

  logSecurityEvent({
    action: TEST_SECURITY_ACTIONS.PUBLISH_ATTEMPT,
    testId: Number(testId),
    userId,
    outcome: 'allowed',
    reason: summary.skipped ? 'DRAFT_MATERIALIZATION_IDEMPOTENT' : 'DRAFT_MATERIALIZED',
    metadata: {
      draftVersion: summary.draftVersion,
      questionCount: summary.questionCount,
    },
  });
}

/**
 * @param {number} testId
 * @param {number|null} userId
 * @param {Error} error
 */
export async function auditQuizDraftMaterializationFailure(testId, userId, error) {
  await logActivity({
    userId,
    role: 'admin',
    action: 'admin.test.quiz_draft.materialize_failed',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      testId: Number(testId),
      errorCode: error.errorCode || error.code || 'UNKNOWN',
      message: error.message,
    },
  });
}
