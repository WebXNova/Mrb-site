/**
 * Result API — read-only parameterized queries (no writes).
 */

import { DERIVED_PASS_STATUS_SQL } from './passStatus.js';

/** Params: attemptId */
export const LOAD_RESULT_CONTEXT_SQL = `
  SELECT
    a.id AS attempt_id,
    a.test_id,
    a.student_id,
    a.user_id,
    a.status AS attempt_status,
    a.started_at,
    a.submitted_at,
    r.id AS result_id,
    r.score,
    r.percentage,
    r.correct_answers,
    r.wrong_answers,
    r.skipped_answers AS unanswered_answers,
    ${DERIVED_PASS_STATUS_SQL} AS pass_status,
    r.time_taken_seconds,
    r.max_score,
    t.title AS test_title,
    t.show_result_immediately,
    t.show_answers_after_submit,
    t.show_explanations
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.deleted_at IS NULL
  INNER JOIN test_results r ON r.attempt_id = a.id
  WHERE a.id = ?
  LIMIT 1
`;

/**
 * Batch detailed answer rows — single query, no N+1.
 * Params: attemptId, testId
 */
export const LOAD_DETAILED_ANSWERS_SQL = `
  SELECT
    qb.id AS question_id,
    qb.question_text,
    qb.question_image_url,
    qb.explanation,
    sa.selected_option_id,
    selected_opt.option_text AS selected_option_text,
    selected_opt.option_key AS selected_option_key,
    correct_opt.option_text AS correct_option_text,
    correct_opt.option_key AS correct_option_key,
    CASE
      WHEN sa.selected_option_id IS NULL THEN 'unanswered'
      WHEN sa.selected_option_id = correct_opt.id THEN 'correct'
      ELSE 'wrong'
    END AS answer_status
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  LEFT JOIN student_answers sa
    ON sa.attempt_id = ?
   AND sa.question_id = tq.question_id
  LEFT JOIN question_options selected_opt
    ON selected_opt.id = sa.selected_option_id
  LEFT JOIN question_options correct_opt
    ON correct_opt.question_id = qb.id
   AND correct_opt.is_correct = 1
  WHERE tq.test_id = ?
  ORDER BY tq.display_order ASC, tq.id ASC
`;

/**
 * Load all options for test questions — used to build full option list per question.
 * Params: testId
 */
export const LOAD_TEST_OPTIONS_SQL = `
  SELECT
    qo.id AS option_id,
    qo.question_id,
    qo.option_key,
    qo.option_text,
    qo.image_url,
    qo.is_correct,
    qo.sort_order
  FROM question_options qo
  INNER JOIN test_questions tq ON tq.question_id = qo.question_id
  WHERE tq.test_id = ?
  ORDER BY qo.question_id ASC, qo.sort_order ASC, qo.id ASC
`;

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 */
export async function loadResultContextRow(db, attemptId) {
  const [rows] = await db.query(LOAD_RESULT_CONTEXT_SQL, [attemptId]);
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 * @param {number} testId
 */
export async function loadDetailedAnswerRows(db, attemptId, testId) {
  const [rows] = await db.query(LOAD_DETAILED_ANSWERS_SQL, [attemptId, testId]);
  return rows;
}

/**
 * Load all options for all questions in a test — merged into answer review.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} testId
 * @returns {Promise<Map<number, Array<Record<string, unknown>>>>}
 */
export async function loadTestQuestionOptions(db, testId) {
  const [rows] = await db.query(LOAD_TEST_OPTIONS_SQL, [testId]);
  const map = new Map();
  for (const row of rows) {
    const qid = Number(row.question_id);
    if (!map.has(qid)) map.set(qid, []);
    map.get(qid).push({
      optionId: Number(row.option_id),
      optionKey: row.option_key == null ? null : String(row.option_key),
      optionText: String(row.option_text ?? ''),
      imageUrl: row.image_url == null ? null : String(row.image_url),
      isCorrect: Boolean(Number(row.is_correct)),
    });
  }
  return map;
}
