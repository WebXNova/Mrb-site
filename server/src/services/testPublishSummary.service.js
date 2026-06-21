import { mysqlPool } from '../config/mysql.js';
import { findTestQuizDraftByTestIdForRead } from '../repositories/testQuizDraft.repository.js';
import { validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { loadComposedTestQuestions } from './testQuestionComposition.service.js';
import { resolveTestQuestionAuthority, QUESTION_AUTHORITY_SOURCES } from './testQuestionAuthority.service.js';
import { loadTestCompletenessRow } from './testCompleteness.service.js';
import { computeTestTotalMarks } from './testTotalMarks.service.js';

/**
 * @returns {{ easy: number, medium: number, hard: number, unset: number }}
 */
function emptyDifficultyMix() {
  return { easy: 0, medium: 0, hard: 0, unset: 0 };
}

/**
 * @param {{ easy: number, medium: number, hard: number, unset: number }} mix
 * @param {string|null|undefined} difficulty
 */
function tallyDifficulty(mix, difficulty) {
  const key = String(difficulty ?? '').trim().toLowerCase();
  if (key === 'easy') {
    mix.easy += 1;
    return;
  }
  if (key === 'medium') {
    mix.medium += 1;
    return;
  }
  if (key === 'hard') {
    mix.hard += 1;
    return;
  }
  mix.unset += 1;
}

/**
 * @param {number[]} bankIds
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function loadBankDifficultyMap(bankIds, executor) {
  const ids = [...new Set(bankIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await executor.query(
    `SELECT id, difficulty
     FROM question_bank
     WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
    ids
  );

  return new Map(rows.map((row) => [Number(row.id), row.difficulty]));
}

/**
 * @param {unknown} draftPayload
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 */
async function summarizeQuizDraft(draftPayload, executor) {
  const questions = Array.isArray(draftPayload?.questions) ? draftPayload.questions : [];
  const difficultyMix = emptyDifficultyMix();
  const bankIds = [];
  let totalQuestions = 0;
  let totalMarks = 0;

  for (const [index, question] of questions.entries()) {
    const result = validateMcqQuizDraftQuestion(question, index, { context: 'manual_save' });
    const isValid =
      result.valid ||
      (result.skipped &&
        String(question?.questionText ?? '').trim() &&
        Array.isArray(question?.choices) &&
        question.choices.length >= 2);

    if (!isValid) continue;

    totalQuestions += 1;
    const points = Number(question?.points);
    totalMarks += Number.isFinite(points) && points > 0 ? points : 0;

    const bankMatch = String(question?.id ?? '').match(/^bank-(\d+)$/);
    if (bankMatch) {
      bankIds.push(Number(bankMatch[1]));
    } else {
      tallyDifficulty(difficultyMix, null);
    }
  }

  const difficultyByBankId = await loadBankDifficultyMap(bankIds, executor);
  for (const bankId of bankIds) {
    tallyDifficulty(difficultyMix, difficultyByBankId.get(bankId));
  }

  return { total_questions: totalQuestions, total_marks: totalMarks, difficulty_mix: difficultyMix };
}

/**
 * @param {Array<Record<string, unknown>>} composedQuestions
 */
function summarizeComposedQuestions(composedQuestions) {
  const difficultyMix = emptyDifficultyMix();
  let totalMarks = 0;

  for (const question of composedQuestions) {
    const marks = Number(question.effectiveMarks ?? question.marks ?? 0);
    totalMarks += Number.isFinite(marks) && marks > 0 ? marks : 0;
    tallyDifficulty(difficultyMix, question.difficulty);
  }

  return {
    total_questions: composedQuestions.length,
    total_marks: totalMarks,
    difficulty_mix: difficultyMix,
  };
}

/**
 * Pre-publish summary for wizard UI — derived from authoritative question source.
 *
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function buildTestPublishSummary(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const testRow = await loadTestCompletenessRow(tid, executor);
  if (!testRow) {
    return null;
  }

  const authority = await resolveTestQuestionAuthority(tid, executor, { testRow });
  const durationMinutes = Number(testRow.duration_minutes);
  const passingMarks = Number(testRow.passing_marks ?? 0);
  const totalMarks = await computeTestTotalMarks(tid, executor, { useCache: false });

  let questionSummary = {
    total_questions: 0,
    difficulty_mix: emptyDifficultyMix(),
  };

  if (authority.source === QUESTION_AUTHORITY_SOURCES.QUIZ_DRAFT) {
    const draft = await findTestQuizDraftByTestIdForRead(executor, tid);
    questionSummary = await summarizeQuizDraft(draft?.draftPayload, executor);
  } else if (authority.questionCount > 0) {
    const composed = await loadComposedTestQuestions(tid, { connection: executor, logOrphans: false });
    questionSummary = summarizeComposedQuestions(composed);
  }

  return {
    total_questions: questionSummary.total_questions,
    total_marks: totalMarks,
    passing_marks: passingMarks,
    duration_minutes: Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : null,
    difficulty_mix: questionSummary.difficulty_mix,
    question_source: authority.source,
  };
}
