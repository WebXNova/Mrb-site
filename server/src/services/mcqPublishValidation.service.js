/**
 * Publish-time MCQ gate — validates authoritative question source only.
 */

import { mysqlPool } from '../config/mysql.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import { validateMcqQuestion, validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import { QUESTION_AUTHORITY_SOURCES } from './testQuestionAuthority.service.js';

export const MCQ_PUBLISH_ERROR_CODE = 'INVALID_MCQ_FOR_PUBLISH';

const LOAD_LINKED_MCQ_SQL = `
  SELECT
    qb.id AS question_id,
    qb.question_text,
    qb.question_image_url,
    qb.question_type
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id = ?
  ORDER BY tq.display_order ASC, tq.id ASC
`;

const LOAD_OPTIONS_SQL = `
  SELECT option_key, option_text, image_url, is_correct, sort_order
  FROM question_options
  WHERE question_id = ?
  ORDER BY sort_order ASC, id ASC
`;

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function collectDraftMcqFailures(testId, executor) {
  /** @type {Array<{ source: string, questionId?: string|null, issues: import('../validation/mcq/mcqValidation.engine.js').McqValidationIssue[] }>} */
  const failures = [];

  const draft = await findTestQuizDraftByTestIdForRead(executor, testId);
  const draftQuestions = Array.isArray(draft?.draftPayload?.questions) ? draft.draftPayload.questions : [];

  for (const [index, question] of draftQuestions.entries()) {
    const result = validateMcqQuizDraftQuestion(question, index, { context: 'publish' });
    if (!result.skipped && !result.valid) {
      failures.push({
        source: 'quiz_draft',
        questionId: question?.id ?? null,
        issues: result.errors,
      });
    }
  }

  return failures;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function collectRuntimeMcqFailures(testId, executor) {
  /** @type {Array<{ source: string, questionId?: number, issues: import('../validation/mcq/mcqValidation.engine.js').McqValidationIssue[] }>} */
  const failures = [];

  const [linkedRows] = await executor.query(LOAD_LINKED_MCQ_SQL, [testId]);
  for (const row of linkedRows) {
    const questionType = String(row.question_type || '').toLowerCase();
    if (questionType && questionType !== 'mcq' && questionType !== 'multiple_choice') {
      continue;
    }

    const [optionRows] = await executor.query(LOAD_OPTIONS_SQL, [row.question_id]);
    const result = validateMcqQuestion(
      {
        question_text: row.question_text,
        question_image_url: row.question_image_url,
        options: optionRows.map((option) => ({
          option_key: option.option_key,
          option_text: option.option_text,
          image_url: option.image_url,
          is_correct: Number(option.is_correct) === 1,
          sort_order: option.sort_order,
        })),
      },
      {
        format: 'question_bank',
        context: 'publish',
        pathPrefix: `linked_questions[${row.question_id}]`,
        stripHtml: true,
        questionId: Number(row.question_id),
      }
    );

    if (!result.valid) {
      failures.push({
        source: 'question_bank',
        questionId: Number(row.question_id),
        issues: result.errors,
      });
    }
  }

  return failures;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ authority?: Awaited<ReturnType<typeof import('./testQuestionAuthority.service.js').resolveTestQuestionAuthority>> }} [options]
 */
export async function collectMcqPublishValidationIssues(testId, executor = mysqlPool, options = {}) {
  const authority =
    options.authority ??
    (await import('./testQuestionAuthority.service.js')).then((mod) =>
      mod.resolveTestQuestionAuthority(testId, executor)
    );

  const resolvedAuthority = await authority;

  if (resolvedAuthority.source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT) {
    return collectDraftMcqFailures(testId, executor);
  }

  return collectRuntimeMcqFailures(testId, executor);
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function validateTestMcqsForPublish(testId, executor = mysqlPool) {
  const failures = await collectMcqPublishValidationIssues(testId, executor);
  if (!failures.length) {
    return { valid: true, failures: [] };
  }

  const issues = failures.flatMap((failure) =>
    failure.issues.map((issue) => ({
      ...issue,
      source: failure.source,
      questionId: failure.questionId,
    }))
  );

  throw new McqValidationError(issues, {
    context: 'publish',
    pathPrefix: `tests[${testId}]`,
    publishBlocked: true,
    publishErrorCode: MCQ_PUBLISH_ERROR_CODE,
  });
}
