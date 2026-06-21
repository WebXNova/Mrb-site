/**
 * Test Question Authority — single source of truth for completeness question counts.
 *
 * ARCHITECTURE
 * ------------
 * Completeness, lifecycle sync, and publish gates MUST use resolveTestQuestionAuthority().
 * Do not call countActiveComposedQuestionsForTest + draft counts independently.
 *
 * MUTUALLY EXCLUSIVE SOURCES (never both):
 *   1. Published test        → runtime_composed (test_questions + active question_bank)
 *   2. Unpublished + draft   → quiz_draft (valid draft questions only)
 *   3. Unpublished, no draft → runtime_composed (legacy manual links)
 *
 * MIGRATION: logic-only — no schema change. Existing tests with manual links keep
 * working until a quiz draft is created; once a draft exists it becomes authoritative.
 */

import { mysqlPool } from '../config/mysql.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import { validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { countActiveComposedQuestionsForTest } from './testQuestionComposition.service.js';

/**
 * @param {string|null|undefined} status
 */
function isPublishedDbStatus(status) {
  return String(status || '').trim().toLowerCase() === 'published';
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function loadTestRowForAuthority(testId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT id, course_id, title, category, test_type, duration_minutes, max_attempts, access_mode, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [Number(testId)]
  );
  return rows[0] ?? null;
}

export const QUESTION_AUTHORITY_SOURCES = Object.freeze({
  QUIZ_DRAFT: 'quiz_draft',
  RUNTIME_COMPOSED: 'runtime_composed',
  NONE: 'none',
});

/**
 * @param {unknown} draftPayload
 */
export function countValidDraftQuestions(draftPayload) {
  const questions = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  let validCount = 0;

  for (const [index, question] of questions.entries()) {
    const result = validateMcqQuizDraftQuestion(question, index, { context: 'manual_save' });
    if (result.skipped) {
      const text = String(question?.questionText ?? '').trim();
      const choices = Array.isArray(question?.choices) ? question.choices : [];
      if (text && choices.length >= 2) {
        validCount += 1;
      }
      continue;
    }
    if (result.valid) {
      validCount += 1;
    }
  }

  return validCount;
}

/**
 * @param {import('../repositories/testQuizDraft.repository.js').ReturnType<typeof import('../repositories/testQuizDraft.repository.js').mapTestQuizDraftRow>} draft
 */
function hasActiveQuizDraft(draft) {
  return Boolean(draft && !draft.deletedAt && draft.draftPayload);
}

/**
 * Resolve authoritative question count for completeness / publish / wizard UI.
 *
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ testRow?: Record<string, unknown>|null, draft?: ReturnType<typeof import('../repositories/testQuizDraft.repository.js').mapTestQuizDraftRow>|null }} [options]
 */
export async function resolveTestQuestionAuthority(testId, executor, options = {}) {
  const tid = Number(testId);
  const testRow = options.testRow ?? (await loadTestRowForAuthority(tid, executor));
  const runtimeComposedCount = await countActiveComposedQuestionsForTest(tid, executor);

  if (!testRow) {
    return {
      testId: tid,
      source: QUESTION_AUTHORITY_SOURCES.NONE,
      questionCount: 0,
      runtimeComposedCount,
      draftQuestionCount: 0,
      draftTotalCount: 0,
      isPublished: false,
      hasQuizDraft: false,
    };
  }

  const isPublished = isPublishedDbStatus(testRow.status);
  if (isPublished) {
    return {
      testId: tid,
      source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
      questionCount: runtimeComposedCount,
      runtimeComposedCount,
      draftQuestionCount: 0,
      draftTotalCount: 0,
      isPublished: true,
      hasQuizDraft: false,
    };
  }

  const draft =
    options.draft !== undefined
      ? options.draft
      : await findTestQuizDraftByTestIdForRead(executor, tid);

  if (hasActiveQuizDraft(draft)) {
    const draftTotalCount = Array.isArray(draft.draftPayload?.questions)
      ? draft.draftPayload.questions.length
      : 0;
    const draftQuestionCount = countValidDraftQuestions(draft.draftPayload);

    return {
      testId: tid,
      source: QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT,
      questionCount: draftQuestionCount,
      runtimeComposedCount,
      draftQuestionCount,
      draftTotalCount,
      isPublished: false,
      hasQuizDraft: true,
      draftId: draft.draftId,
      draftVersion: draft.version,
    };
  }

  return {
    testId: tid,
    source: QUESTION_AUTHORITY_SOURCES.RUNTIME_COMPOSED,
    questionCount: runtimeComposedCount,
    runtimeComposedCount,
    draftQuestionCount: 0,
    draftTotalCount: 0,
    isPublished: false,
    hasQuizDraft: false,
  };
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function resolveAuthoritativeQuestionCount(testId, executor) {
  const authority = await resolveTestQuestionAuthority(testId, executor);
  return authority.questionCount;
}
