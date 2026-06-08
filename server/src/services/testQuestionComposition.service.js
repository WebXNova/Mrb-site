/**
 * Composed test question read model — question_bank driven.
 *
 * Loads junction rows + question_bank + question_options only.
 * Never reads embedded test_questions content columns.
 */

import { mysqlPool } from '../config/mysql.js';
import { loadTestSubjectPresentation } from './testSubjectPresentation.service.js';
import {
  toLinkedTestQuestionAdminDto,
  toLinkedTestQuestionStudentDto,
} from '../dto/testQuestion.dto.js';
import { TestNotFoundError } from '../errors/testBuilder/TestBuilderErrors.js';

/** Server-authored instructions shown on the pre-test page (never client-only). */
export const STANDARD_TEST_INSTRUCTIONS = Object.freeze([
  'Read each question carefully before selecting your answer.',
  'You can move between questions and change answers until you submit.',
  'The timer starts when you begin the test and cannot be paused.',
  'Submit before time runs out — unanswered questions may be marked incorrect.',
  'Do not refresh or close the browser during the test unless instructed.',
  'Contact your instructor if you experience technical issues.',
]);

const COMPOSED_LINK_SQL = `
  SELECT
    tq.id AS link_id,
    tq.test_id,
    tq.question_id,
    tq.display_order,
    tq.marks_override,
    tq.created_at,
    tq.updated_at,
    qb.question_text,
    qb.explanation,
    qb.marks,
    qb.difficulty,
    qb.topic,
    qb.subject_id,
    qb.question_type,
    qb.course_id
  FROM test_questions tq
  INNER JOIN tests t ON t.id = tq.test_id
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id = ?
  ORDER BY tq.display_order ASC, tq.id ASC`;

/**
 * @param {number[]} questionIds
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
async function loadOptionsByQuestionIds(questionIds, executor = mysqlPool) {
  const ids = [...new Set(questionIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await executor.query(
    `SELECT id, question_id, option_text, is_correct, sort_order
     FROM question_options
     WHERE question_id IN (${placeholders})
     ORDER BY question_id ASC, sort_order ASC, id ASC`,
    ids
  );

  const map = new Map();
  for (const row of rows) {
    const qid = Number(row.question_id);
    if (!map.has(qid)) map.set(qid, []);
    map.get(qid).push(row);
  }
  return map;
}

/**
 * Links pointing at missing or soft-deleted bank rows (excluded from composed load).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
async function findOrphanedTestQuestionLinks(testId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT tq.question_id
     FROM test_questions tq
     LEFT JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ? AND qb.id IS NULL`,
    [testId]
  );
  return rows.map((row) => Number(row.question_id));
}

/**
 * @param {number} testId
 * @param {number[]} orphanedQuestionIds
 */
function logOrphanedTestQuestionLinks(testId, orphanedQuestionIds) {
  if (!orphanedQuestionIds.length) return;
  console.warn(
    '[testQuestionComposition] Published test references deleted or missing question_bank rows; excluding from attempt load.',
    { testId, questionIds: orphanedQuestionIds }
  );
}

/**
 * Single source of truth for exam questions (question_bank + question_options via test_questions).
 *
 * @param {number} testId
 * @param {{ audience?: 'admin' | 'student', connection?: import('mysql2/promise').PoolConnection, logOrphans?: boolean }} [options]
 */
export async function loadComposedTestQuestions(testId, options = {}) {
  const tid = Number(testId);
  if (!Number.isInteger(tid) || tid <= 0) {
    throw new TestNotFoundError({ testId });
  }

  const executor = options.connection ?? mysqlPool;
  const audience = options.audience === 'student' ? 'student' : 'admin';
  const shouldLogOrphans = options.logOrphans !== false;

  if (shouldLogOrphans) {
    const orphaned = await findOrphanedTestQuestionLinks(tid, executor);
    logOrphanedTestQuestionLinks(tid, orphaned);
  }

  const [linkRows] = await executor.query(COMPOSED_LINK_SQL, [tid]);
  if (!linkRows.length) {
    const [testRows] = await executor.query(`SELECT id FROM tests WHERE id = ? LIMIT 1`, [tid]);
    if (!testRows[0]) {
      throw new TestNotFoundError({ testId: tid });
    }
    return [];
  }

  const questionIds = linkRows.map((row) => Number(row.question_id));
  const optionsMap = await loadOptionsByQuestionIds(questionIds, executor);

  const mapper = audience === 'student' ? toLinkedTestQuestionStudentDto : toLinkedTestQuestionAdminDto;

  return linkRows.map((row) => mapper(row, optionsMap.get(Number(row.question_id)) ?? []));
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @returns {Promise<Set<number>>}
 */
export async function loadTestQuestionIdSet(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT tq.question_id
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?`,
    [tid]
  );
  return new Set(rows.map((row) => Number(row.question_id)));
}

/**
 * @param {number} testId
 */
/**
 * Active composed questions only (excludes deleted bank rows and orphan links).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function countActiveComposedQuestionsForTest(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT COUNT(*) AS total
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?`,
    [tid]
  );
  return Number(rows[0]?.total ?? 0);
}

/** @deprecated Use countActiveComposedQuestionsForTest */
export async function countComposedTestQuestions(testId, executor = mysqlPool) {
  return countActiveComposedQuestionsForTest(testId, executor);
}

/**
 * @param {string} publicSlug
 */
/**
 * Maps composed student DTOs to the attempt UI contract (question_bank ids).
 * @param {Array<{ questionId: number, questionText: string, marks: number, displayOrder: number, options: Array<{ optionId: number, optionText: string }> }>} composed
 */
export function mapComposedQuestionsForStudentAttempt(composed) {
  return composed.map((q) => ({
    id: q.questionId,
    questionText: q.questionText,
    questionImageUrl: null,
    options: (q.options || []).map((o) => ({
      id: o.optionId,
      text: o.optionText,
    })),
    marks: q.marks,
    orderIndex: q.displayOrder,
  }));
}

/**
 * Per-question option counts for attempt-load diagnostics.
 * @param {Array<{ questionId?: number, id?: number, options?: unknown[] }>} questions
 */
export function summarizeComposedQuestionOptions(questions) {
  return questions.map((question) => {
    const questionId = Number(question.questionId ?? question.id);
    const options = Array.isArray(question.options) ? question.options : [];
    return {
      questionId,
      optionCount: options.length,
    };
  });
}

/**
 * Linked MCQs with fewer than two options (invalid for delivery).
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function findLinkedMcqsWithoutOptions(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [rows] = await executor.query(
    `SELECT qb.id AS question_id, qb.question_text, COUNT(qo.id) AS option_count
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     LEFT JOIN question_options qo ON qo.question_id = qb.id
     WHERE tq.test_id = ? AND LOWER(qb.question_type) = 'mcq'
     GROUP BY qb.id, qb.question_text
     HAVING option_count < 2`,
    [tid]
  );
  return rows.map((row) => ({
    questionId: Number(row.question_id),
    questionText: String(row.question_text ?? ''),
    optionCount: Number(row.option_count ?? 0),
  }));
}

export async function loadPublishedTestMetaBySlug(publicSlug) {
  const slug = String(publicSlug || '').trim();
  if (!slug) return null;

  const [rows] = await mysqlPool.query(
    `SELECT id, title, description, duration_minutes, public_slug, course_id,
            passing_percentage, negative_marking, max_attempts
     FROM tests
     WHERE public_slug = ? AND status = 'published' AND deleted_at IS NULL
     LIMIT 1`,
    [slug]
  );
  const test = rows[0];
  if (!test) return null;

  const testId = Number(test.id);
  const questionCount = await countComposedTestQuestions(testId);
  const subjectPresentation = await loadTestSubjectPresentation(testId);
  const negativeMarking = Number(test.negative_marking ?? 0);
  const customInstructions =
    test.description == null || String(test.description).trim() === ''
      ? null
      : String(test.description).trim();

  return {
    id: testId,
    title: String(test.title || ''),
    subject: subjectPresentation.displayLabel,
    subjectIds: subjectPresentation.subjectIds,
    subjectTitles: subjectPresentation.subjectTitles,
    durationMinutes: Number(test.duration_minutes ?? 0),
    publicSlug: test.public_slug,
    questionCount,
    passingPercentage: Number(test.passing_percentage ?? 0),
    negativeMarking,
    negativeMarkingEnabled: negativeMarking > 0,
    maxAttempts: Number(test.max_attempts ?? 1),
    description: customInstructions,
    customInstructions,
    standardInstructions: [...STANDARD_TEST_INSTRUCTIONS],
  };
}
