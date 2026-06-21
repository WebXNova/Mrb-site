/**
 * Single source of truth for computed test total marks.
 *
 * total_marks = SUM(COALESCE(marks_override, question_bank.marks, 1))
 *
 * Never stored on tests — always derived from linked questions.
 */

import { mysqlPool } from '../config/mysql.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import { resolveTestQuestionAuthority, QUESTION_AUTHORITY_SOURCES } from './testQuestionAuthority.service.js';
import { loadTestCompletenessRow } from './testCompleteness.service.js';
import { validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { normalizeQuestionMarks } from '../validators/questionMarks.validation.js';

const CACHE_TTL_MS = 60_000;

/** @type {Map<number, { value: number, expiresAt: number }>} */
const totalMarksCache = new Map();

export const TOTAL_MARKS_SQL = `
  SELECT COALESCE(SUM(COALESCE(tq.marks_override, qb.marks, 1)), 0) AS total_marks
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id = ?
`;

/**
 * @param {number} testId
 */
export function invalidateTestTotalMarksCache(testId) {
  const tid = Number(testId);
  if (Number.isInteger(tid) && tid > 0) {
    totalMarksCache.delete(tid);
  }
}

/**
 * Invalidate cached totals for every test linked to a question (after marks change).
 *
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function invalidateTestTotalMarksCacheForQuestion(questionId, executor = mysqlPool) {
  const qid = Number(questionId);
  if (!Number.isInteger(qid) || qid <= 0) return;

  const [rows] = await executor.query(
    `SELECT DISTINCT test_id FROM test_questions WHERE question_id = ?`,
    [qid]
  );
  for (const row of rows) {
    invalidateTestTotalMarksCache(row.test_id);
  }
}

/**
 * @param {unknown} draftPayload
 * @returns {number}
 */
function sumQuizDraftMarks(draftPayload) {
  const questions = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  let total = 0;

  for (const [index, question] of questions.entries()) {
    const result = validateMcqQuizDraftQuestion(question, index, { context: 'manual_save' });
    const isValid =
      result.valid ||
      (result.skipped &&
        String(question?.questionText ?? '').trim() &&
        Array.isArray(question?.choices) &&
        question.choices.length >= 2);

    if (!isValid) continue;

    try {
      const marks = normalizeQuestionMarks(question?.points ?? question?.marks, {
        defaultWhenMissing: true,
      });
      total += marks;
    } catch {
      total += 0;
    }
  }

  return Math.round(total * 100) / 100;
}

/**
 * Compute total marks for a test from its authoritative question source.
 *
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @param {{ useCache?: boolean }} [options]
 * @returns {Promise<number>}
 */
export async function computeTestTotalMarks(testId, executor = mysqlPool, options = {}) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) {
    return 0;
  }

  const useCache = options.useCache !== false;
  if (useCache) {
    const cached = totalMarksCache.get(tid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
  }

  const testRow = await loadTestCompletenessRow(tid, executor);
  if (!testRow) {
    return 0;
  }

  const authority = await resolveTestQuestionAuthority(tid, executor, { testRow });
  let totalMarks = 0;

  if (authority.source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT) {
    const draft = await findTestQuizDraftByTestIdForRead(executor, tid);
    totalMarks = sumQuizDraftMarks(draft?.draftPayload);
  } else if (authority.questionCount > 0) {
    const [rows] = await executor.query(TOTAL_MARKS_SQL, [tid]);
    totalMarks = Number(rows[0]?.total_marks ?? 0);
    if (!Number.isFinite(totalMarks) || totalMarks < 0) {
      totalMarks = 0;
    }
    totalMarks = Math.round(totalMarks * 100) / 100;
  }

  if (useCache) {
    totalMarksCache.set(tid, { value: totalMarks, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  return totalMarks;
}

/**
 * @param {number} passingMarks
 * @param {number} totalMarks
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePassingMarksAgainstTotal(passingMarks, totalMarks) {
  const passing = Number(passingMarks);
  const total = Number(totalMarks);

  if (!Number.isFinite(passing) || passing < 0) {
    return { ok: false, message: 'passing_marks must be 0 or greater' };
  }

  if (!Number.isFinite(total) || total <= 0) {
    return {
      ok: false,
      message: 'Add questions with marks before setting passing marks',
    };
  }

  if (passing > total) {
    return {
      ok: false,
      message: `passing_marks (${passing}) cannot exceed total marks (${total})`,
    };
  }

  return { ok: true };
}
